# Architecture

The whole system exists to make one sentence true: **a seat cannot be sold
twice, and a user cannot be charged twice.** Everything below is either that
guarantee or a consequence of it.

## The problem

The naive booking flow has a race in it:

```
SELECT count(*) FROM seats WHERE show = ? AND state = 'AVAILABLE'   -- 3 left
-- another request runs the same query here and also sees 3
INSERT booking ...                                                  -- both succeed
```

The window between the read and the write is where overselling lives. It is
small, which is why most implementations never see it, and it is unavoidable
as long as the check and the write are separate operations.

## The mechanic

Seat inventory is one row per seat per showtime, in `ShowSeat`. Claiming seats
is a single transaction that takes row locks as part of the check:

```sql
BEGIN;
SET LOCAL lock_timeout = '1500ms';

SELECT ss.id, ss."priceMinor", …
FROM "ShowSeat" ss
JOIN "Seat" s ON s.id = ss."seatId"
WHERE ss."showtimeId" = $1
  AND ss.id = ANY($2::text[])
  AND (ss.state = 'AVAILABLE'
       OR (ss.state = 'HELD' AND ss."holdExpiresAt" <= now()))
ORDER BY ss.id
FOR UPDATE OF ss;

-- fewer rows than requested → ROLLBACK, 409 naming the missing seats
UPDATE "ShowSeat" SET state='HELD', "holdId"=…, "holdExpiresAt"=… WHERE …;
COMMIT;
```

Four things are doing work here.

**`FOR UPDATE` closes the window.** A second transaction asking for the same
seat blocks on the lock, and when the first commits, Postgres re-evaluates the
`state` predicate before returning the row. The seat has changed state, so it
drops out of the result. The check _is_ the lock; there is nothing in between.

**The row count is the all-or-nothing test.** If three seats were asked for and
two came back locked, the third belongs to someone else and the transaction
rolls back. A partial hold would strand seats no user believes they own.

**`ORDER BY ss.id` makes lock ordering deterministic**, which removes almost
all deadlocks between concurrent holds. The ones that survive — a hold racing
the sweeper, say — are retried by `withTxRetry`, which is safe precisely
because Postgres guarantees a deadlock victim wrote nothing.

**`lock_timeout` bounds the wait.** Without it, a contended hold sits until the
transaction times out and the user watches a spinner for five seconds before
learning the seat is gone. With it, the p99 of the hold endpoint stops being
decided by the slowest lock holder, and a pileup answers `SEATS_CONTENDED`,
which the client retries.

`ShowSeat` has `@@unique([showtimeId, seatId])` and a single nullable
`bookingId`. Overselling is therefore not merely prevented by the code path; a
seat physically cannot appear twice in a show's inventory or belong to two
bookings.

## Expiry without a job

A hold lasts five minutes. It expires **logically**: every read path and every
locking query treats `state = 'HELD' AND holdExpiresAt <= now()` as available.
A seat is free the instant its hold lapses, whether or not anything has run.

The sweeper (`src/jobs/sweeper.ts`) exists only to tidy rows and to emit the
release events the realtime channel needs. If it never runs, the system still
never oversells. That is asserted directly by the `sweeper-disabled` chaos
scenario, which ages holds out and then books the seats again with no sweep in
between.

Comparisons are made against `now()` — the **database** clock — never the API
process's clock, so several API instances with drifting clocks cannot disagree
about whether a hold is alive.

## Idempotency

Two endpoints must never run twice for one user action: creating a hold, and
starting a payment. Both require an `Idempotency-Key` header.

The key is **claimed in its own committed transaction before the work starts**,
using `INSERT … ON CONFLICT DO UPDATE … WHERE state='IN_FLIGHT' AND createdAt <
staleBefore`. Recording the key afterwards would leave a window in which a
retry sees nothing and runs the work again — the same read-then-write race, one
layer up. A retry that arrives while the first attempt is still running gets a
409 telling it to wait, which is the right answer: ambiguity is cheaper than a
second charge.

Domain failures are stored and replayed, so a retried request that was declined
gets the same decline rather than a fresh attempt at the gateway. Unexpected
failures release the claim, because their outcome is unknown and the client
deserves a real retry.

## Payment lifecycle

```
hold ──checkout──> booking PENDING + payment PENDING ──gateway──> callback
                                                                     │
                        ┌────────────────────────────────────────────┤
                        │                                            │
                   captured                                       declined
                        │                                            │
              seats CONFIRMED                              payment FAILED,
              booking CONFIRMED                            hold still ACTIVE,
              hold CONVERTED                               user retries in place
```

The payment reference is **ours**, derived deterministically from the
idempotency key, and doubles as the gateway's idempotency key. Because we choose
it, the payment row is written in the same transaction as the booking, before
the gateway is called at all. A crash immediately after that commit leaves a
charge that reconciliation can still find.

Confirmation is only ever written from a signature-verified callback.
Deduplication of callbacks is the insert itself: `WebhookEvent.id` is the
gateway's own event id, so a duplicate delivery loses the primary-key race.
Out-of-order callbacks are handled by ranking statuses, so a late
`authorized` cannot walk a captured payment backwards.

**The late-capture case is handled rather than assumed away.** If the hold ran
out before the capture landed, the seats are already back on sale. Confirming
them would oversell, so the payment is marked for refund and the booking fails.
That path has a test and a chaos scenario, because it is the one that costs
real users real money.

A booking may have several payment attempts and only one may reach `CAPTURED`,
which the invariant script asserts.

## What Redis is not

Redis carries realtime fanout. It holds no seat state, no locks and no source
of truth. Every call into it is best-effort and every failure is logged at
`warn`. Restarting it mid-traffic is a chaos scenario, and bookings continue
through it.

That is a deliberate choice over the faster design, where a Lua script does
check-and-set across seat keys and Postgres is written behind it. That version
is quicker and introduces a question — what happens when Redis loses data —
that this project has no good answer to. The measured hold latency (85 ms at
p99 with a thousand concurrent users) says Postgres is not the bottleneck yet,
so the complexity would buy nothing. See `docs/load-testing.md`.

## Decisions that differ from the original plan

**Express, not Fastify.** The scaffold was already Express 5 and the bottleneck
is Postgres row locks, not HTTP parsing. Swapping frameworks would have cost a
week and moved no measured number.

**Cluster mode was added.** A Node process is single-threaded, so one of them
saturates long before Postgres does. `npm run api:cluster` forks one worker per
core. This is also the stronger correctness demonstration: eight processes
contending through the database prove the locking, where one process could be
serialising everything by accident.

**SQLite is gone.** It has no `SELECT … FOR UPDATE` and a single writer lock,
so none of the claims above could be demonstrated on it. Postgres is not
optional here, which is why `docker compose up -d` is the first step in the
README.

## Module map

```
apps/api/src/
  modules/
    holds/        the critical section; everything else is surface
    payments/     gateway boundary, webhooks, reconciliation
    catalog/      movies, showtimes, the seat map read
    bookings/     tickets and signed QR payloads
    realtime/     seat delta publisher
    chaos/        guarded control surface for the chaos suite
  lib/
    tx.ts         transaction retry, lock timeout, the database clock
    idempotency.ts  replay protection
  jobs/sweeper.ts housekeeping, never correctness
  scripts/
    verify-invariants.ts  the assertions that decide whether it works
    chaos.ts              seven failure scenarios
    prepare-load-test.ts  fixture for k6
    load-test-report.ts   what the database says after a run
```
