# Load and chaos testing

Everything here is reproducible from the repo. The scenario is committed, the
fixture generator is committed, and the verdict is not k6's — it is a script
that reads the database afterwards and asserts eleven invariants.

**The failed runs are included on purpose.** A clean sheet from a suite that has
never caught anything is not evidence.

## Running it

```bash
docker compose up -d                 # Postgres 16, Redis 7
npm run db:migrate && npm run db:seed

# Load: cluster mode, because one Node process is not the system under test
API_WORKERS=8 DATABASE_POOL_MAX=25 \
  RATE_LIMIT_GLOBAL_PER_MINUTE=100000 RATE_LIMIT_HOLD_PER_MINUTE=100000 \
  npm run api:cluster

npm run loadtest                     # prepare → k6 → report

# Chaos: single process, because a control request reaches one worker
CHAOS_CONTROLS_ENABLED=true SWEEPER_INTERVAL_SECONDS=10 npm run api
npm run chaos
```

`npm run loadtest` resets the load-test showtime to exactly 300 available
seats, creates 5,000 real user accounts with signed tokens, runs the scenario,
then reports what the database contains.

k6 is not committed. `brew install k6`, or drop the binary at `.tooling/k6`.

## The scenario

`loadtest/opening-night.js`

|               |                                                                         |
| ------------- | ----------------------------------------------------------------------- |
| Inventory     | 300 seats, one showtime                                                 |
| Virtual users | Ramped over 30s, held 30s, drained 10s                                  |
| Behaviour     | browse seat map → hold 1-4 seats → 30% abandon → pay → poll for outcome |
| Retries       | 10% of holds and 10% of checkouts resent with the same idempotency key  |
| Declines      | 10% of payments, from the mock gateway                                  |

A user who finds the house sold out leaves rather than re-polling. Re-polling
in a loop would load the server with traffic no client generates and quietly
turn the run into a benchmark of JSON serialisation.

## Runs

All runs: Postgres 16 and Redis 7 in Docker, API and k6 on the same MacBook
(11 cores). Inventory 300 seats every time. Runs 1 to 7 are the debugging
history; runs 8 to 10 are the current numbers.

| #      | VUs       | Server             | Hold p99  | Unexpected responses | Confirmed | Oversells | Double charges | Invariants |
| ------ | --------- | ------------------ | --------- | -------------------- | --------- | --------- | -------------- | ---------- |
| 1      | 500       | 1 process, no gzip | 7,891 ms  | 1                    | 272       | 0         | 0              | pass       |
| 2      | 5,000     | 1 process, no gzip | 2,889 ms  | 12,985               | 269       | 0         | 0              | pass       |
| 3      | 5,000     | 8 workers, gzip    | 3,115 ms  | 14,683               | 269       | 0         | 0              | pass       |
| 4      | 500       | 8 workers, gzip    | 20 ms     | 0                    | 286       | 0         | 0              | pass       |
| 5      | 1,000     | 8 workers, gzip    | 85 ms     | 0                    | 275       | 0         | 0              | pass       |
| 6      | 2,000     | 8 workers, gzip    | 2,108 ms  | 231                  | 263       | 0         | 0              | pass       |
| 7      | 3,000     | 8 workers, gzip    | 10,473 ms | 1,694                | 281       | 0         | 0              | pass       |
| **8**  | **500**   | current            | **25 ms** | **0**                | 292       | **0**     | **0**          | pass       |
| **9**  | **1,000** | current            | **58 ms** | **0**                | 262       | **0**     | **0**          | pass       |
| **10** | **2,000** | current            | 6,367 ms  | **0**                | 279       | **0**     | **0**          | pass       |

"Confirmed" plus seats still held always came to exactly 300. No run at any
concurrency produced an oversell, a double charge, an orphaned hold, or an
invariant violation — including the runs where the server was being crushed.

### Run 1 — one unhandled 500

A hold transaction hit Prisma's five-second transaction timeout while queued
behind a row lock, and surfaced as an unhandled error:

```
Transaction API error: A query cannot be executed on an expired transaction.
The timeout for this transaction was 5000 ms, however 5534 ms passed.
  at holds.service.ts:116  tx.showSeat.updateMany()
```

The transaction rolled back cleanly, so nothing was oversold. The bug was the
response: contention was reported as an internal error.

Two fixes. `SET LOCAL lock_timeout = '1500ms'` inside the hold transaction, so
a pileup fails fast instead of burning the whole budget waiting; and a mapping
from the timeout SQLSTATEs to a `409 SEATS_CONTENDED`, which the client
retries.

### Runs 2 and 3 — the machine, not the code

Nearly 13,000 requests failed with `dial: i/o timeout` before reaching the
application. Cause:

```
$ sysctl kern.ipc.somaxconn
kern.ipc.somaxconn: 128
```

macOS clamps the listen backlog to 128 regardless of what `listen()` asks for,
so the accept queue overflows during the ramp and the kernel drops connections.
The API never sees them. Raising it needs `sudo sysctl -w
kern.ipc.somaxconn=2048`, or a target that is not a laptop.

Correctness was unaffected at 5,000 VUs — 269 confirmed, 31 held, exactly 300,
zero oversells — but the latency numbers from runs 2, 3 and 7 measure the
socket layer and should not be quoted as application latency.

### The gzip fix

The seat map is the largest response in the system and the first thing a phone
asks for.

|              | 300 seats | 2,080 seats |
| ------------ | --------- | ----------- |
| Uncompressed | 45 KB     | ~310 KB     |
| gzip         | 5.0 KB    | ~34 KB      |

Nine times smaller, one line of middleware. This is what took run 4's hold p99
from seconds to 20 ms: the server had been spending its time serialising and
writing seat maps, and holds were queued behind that work.

### Runs 6 and 10 — the fix from run 1 was not actually working

Run 6 still showed 231 unexpected responses, and a repeat at 1,000 users showed 57. The lock timeout was firing correctly in Postgres; the mapping to a 409 was
not. Prisma reports a failed raw query as its own `P2010` and buries the real
SQLSTATE two levels down:

```json
{
  "code": "P2010",
  "meta": {
    "driverAdapterError": {
      "cause": { "code": "55P03", "originalCode": "55P03", "kind": "postgres" }
    }
  }
}
```

The handler read `err.code` and `err.meta.code`, found neither, and fell
through to a 500. Every one of those was really "someone else is holding this
row", which the client would have retried.

Fixed by extracting the SQLSTATE properly in
[`lib/sql-state.ts`](../apps/api/src/lib/sql-state.ts), which checks each place
Prisma might put it and falls back to parsing the message. It has its own test,
because getting this wrong is silent: everything works, and a fraction of
contention quietly reports as a server fault.

Run 10, at the same 2,000 users as run 6, returned **zero** unexpected
responses. The 1,150 requests that would have been 500s came back as
`409 SEATS_CONTENDED` instead.

### Where this machine tops out

| VUs    | Verdict                                                             |
| ------ | ------------------------------------------------------------------- |
| 500    | clean, hold p99 25 ms                                               |
| 1,000  | clean, hold p99 58 ms                                               |
| 2,000  | correct and no faults, but hold p99 6.4 s: the machine is saturated |
| 3,000+ | the accept queue overflows and connections are dropped              |

**The 200 ms p99 target is met at 1,000 concurrent users. The 5,000-user run
has not been done cleanly**, because the generator and the server share eleven
cores and a 128-entry accept queue. That needs a deployed target, which is the
next thing on the list.

## What the report checks

`npm run verify:invariants` runs eleven assertions as SQL that returns
offending rows, so a check cannot pass by looking at nothing.

- No showtime has more confirmed seats than inventory
- No confirmed seat is missing its booking or points at an unconfirmed one
- Every confirmed booking has exactly one captured payment
- No booking has more than one captured payment
- Every captured payment belongs to a confirmed booking
- A confirmed booking holds exactly the seats its hold claimed
- Booking totals equal the sum of seat prices plus the fee
- Every held seat points at a hold and carries that hold's expiry
- An available seat carries no hold and no booking
- No hold is still active more than 60 seconds past expiry
- No payment has been pending for more than five minutes

## Chaos scenarios

`npm run chaos`. Each scenario states what it expects **before** it runs, resets
inventory first, then hands the verdict to the invariant script.

| Scenario                       | Expected                                                                     | Observed                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `redis-restart`                | Bookings continue; Redis holds no seat state                                 | 300/324 completed across the restart, 0 network errors                                               |
| `postgres-connections-dropped` | In-flight transactions roll back whole; service resumes                      | 25 backends terminated, 23 requests failed, healthy again after 5 ms, 10/10 fresh bookings succeeded |
| `slow-payment-gateway`         | Checkout returns fast against a 5 s gateway; seat locks are not held waiting | 20/20 returned in 24 ms each, all 20 confirmed once the gateway replied                              |
| `duplicate-webhooks`           | Every callback delivered twice; each payment captured once                   | 50 distinct events stored from 100 deliveries, 25 captures, 0 double charges                         |
| `out-of-order-webhooks`        | Capture before authorisation still confirms; no downgrade                    | 25/25 confirmed, 0 payments left below captured                                                      |
| `dropped-webhooks`             | No callback ever arrives; reconciliation resolves it                         | 20 stranded, 20 confirmed by the API's reconciliation pass                                           |
| `sweeper-disabled`             | Expired holds still read as available with no sweep                          | 4 holds aged out, rows still read HELD, map offered the seats, re-holding succeeded                  |

All seven left every invariant holding.

Two of these caught real bugs while being written. `dropped-webhooks`
originally called reconciliation inside the chaos script, which queried that
process's own empty copy of the mock gateway and wrote off twenty genuine
payments as never started. That produced a real fix: reconciliation now leaves
a payment alone for fifteen minutes when the gateway has no record of it, and
distinguishes "gateway says no such payment" from "gateway could not be
reached". Marking a real charge as failed is far worse than leaving it pending
for another pass.

The other was measurement rather than product: scenarios 2 through 7 were
running against a house the first scenario had already sold out, so their
numbers were meaningless even though the invariants passed. Every scenario now
restocks first.

## In-process rehearsal

`npm test` runs the same shape in seconds, so a regression is caught before a
load run:

- 60 simultaneous claims on one seat → exactly one wins, and the database agrees
- 150 users against 80 seats with overlapping blocks → no seat held twice
- 20 simultaneous retries of one request with one key → one hold
- 120 users through the full hold → checkout → pay pipeline with declines and
  duplicate submissions → confirmed seats never exceed inventory, no booking
  charged twice, all invariants hold
