# Boxoffice

A movie ticketing platform built around two claims, both of which have
evidence in this repo: **it provably never oversells**, and the seat map is
built to hold 60fps with two thousand seats on a mid-range Android phone.

React Native (Expo) · React · Node/TypeScript · Postgres · Redis

> **Status.** The correctness core is built and proven, and the flow it exists
> for now runs end to end in the app: browse, pick seats, hold, pay against the
> countdown, ticket. The seat map's Skia performance pass and live availability
> are next. See [Where this is](#where-this-is).

---

## The evidence

Across ten load runs at up to 5,000 concurrent virtual users against a fixed
300-seat inventory:

|                                    |            |
| ---------------------------------- | ---------- |
| Oversells                          | **0**      |
| Double charges                     | **0**      |
| Orphaned holds                     | **0**      |
| Invariant violations               | **0**      |
| Hold p99 at 1,000 concurrent users | **58 ms**  |
| Hold p99 at 500 concurrent users   | **25 ms**  |
| Unexpected responses, latest runs  | **0**      |
| Chaos scenarios survived           | **7 of 7** |

Confirmed seats plus held seats came to exactly 300 in every run, including the
runs where the server was being crushed.

The full report, **including the runs that failed and what was wrong**, is in
[`docs/load-testing.md`](docs/load-testing.md). The verdict is not the load
generator's: an [invariant script](apps/api/src/scripts/verify-invariants.ts)
reads the database afterwards and asserts eleven properties in SQL.

## How overselling is prevented

Inventory is one row per seat per showtime. Claiming seats is one transaction
that takes its locks as part of the check:

```sql
SELECT ss.id FROM "ShowSeat" ss
WHERE ss."showtimeId" = $1 AND ss.id = ANY($2::text[])
  AND (ss.state = 'AVAILABLE'
       OR (ss.state = 'HELD' AND ss."holdExpiresAt" <= now()))
ORDER BY ss.id
FOR UPDATE OF ss;
-- fewer rows than requested → roll back, 409 naming the seats that went
```

There is no window between the check and the write, because the check _is_ the
lock. Fewer rows than asked for means someone else got there first, and the
whole request rolls back rather than leaving a partial hold.

Hold expiry needs no background job: every read path treats a lapsed
`holdExpiresAt` as available, so a seat is free the instant its hold runs out.
The sweeper only tidies rows and emits realtime events. A
[chaos scenario](apps/api/src/scripts/chaos.ts) proves it by ageing holds out
with the sweeper stopped and then booking the seats again.

Full reasoning, including the payment lifecycle and the late-capture refund
path, is in [`docs/architecture.md`](docs/architecture.md).

## Quick start

No Docker required. The quickest way to get both servers is the bundled script,
which keeps its data inside the repo and does not depend on `brew services`
(which fails under launchd on some machines):

```bash
npm run infra:local        # start Postgres :5432 and Redis :6379, create the databases
npm run infra:local:stop
```

Or run them as Homebrew services instead:

```bash
brew install postgresql@16 redis
brew services start postgresql@16 && brew services start redis
createdb ticketing && createdb ticketing_test

npm install
cp apps/api/.env.example apps/api/.env      # fill in the two JWT secrets
cp apps/mobile/.env.example apps/mobile/.env
npm run db:migrate
npm run db:seed
npm run dev                                 # API on :4000, Expo on :8081
```

`docker compose up -d` still works if you would rather containerise the two
services; it publishes Redis on 6380 and a second, tmpfs-backed Postgres on
5434, so adjust `REDIS_URL` and `apps/api/vitest.config.ts` to match.

Generate the secrets with `openssl rand -base64 48`. The API refuses to start
with a missing or short secret, on purpose.

Postgres is not optional. The booking mechanic is built on `SELECT … FOR
UPDATE`, which SQLite cannot express.

**The connection pins its timezone to UTC, and that is load-bearing.** Prisma
maps `DateTime` to `timestamp without time zone`, so on a server initialised in
any other zone every value shifts on the round trip and the expiry model breaks
silently — holds read as expired, sales read as closed, and the tests fail in
ways that look like a locking bug. `?options=-c%20timezone%3DUTC` on
`DATABASE_URL` makes the app independent of how the server was set up. Docker's
Postgres image happens to run in UTC, which is why this never surfaced there.

The seed creates twelve real films (plus three coming soon), **18 real cinemas
across seven cities** — PVR, INOX, Cinépolis, AMB, Prasads, and single-screen
landmarks like Regal Colaba and Delite — with their actual street addresses and
coordinates, 23 auditoriums including **two 2,080-seat IMAX houses** for the
seat-map performance target, 729 showtimes, 48 reviews, and a fixed **300-seat**
screen reserved for load runs. Demo login: `demo@example.com` / `DemoPassw0rd`.

Venue names, chains and addresses are the real ones; coordinates are accurate to
roughly building precision, which is what a pin and a distance sort need.
Everything else about them — the screens, the showtimes, the prices — is
synthetic.

### Where the film data comes from

Titles, runtimes, certifications, languages and genres are curated in
[`apps/api/prisma/catalogue-source.ts`](apps/api/prisma/catalogue-source.ts).
Synopses and artwork are fetched once and cached to `catalogue.json`, so seeding
is reproducible and works with no network:

```bash
npm run catalogue --workspace @app/api
```

It prefers **TMDB** when `TMDB_API_KEY` is set — the right source for a ticketing
app, since it carries backdrops as well as posters and its terms cover this use
with attribution. Posters come back at `w780` and backdrops at `w1280`. Either
credential works: the v3 API key (32 hex characters) or the v4 read access token
(a JWT). The fetcher detects which one it has, because sending one as the other
returns a 401 describing the _other_ scheme.

Without a key it falls back to **Wikipedia's REST summary**, which is keyless so
a fresh clone works immediately. **This is the reason posters look soft.**
Wikipedia serves non-free film posters under fair use, which means deliberately
small files — often under 300px wide, against roughly 900 device pixels of card
on a 3x phone. No amount of rendering fixes a source that is a third of the
resolution it is drawn at; a free TMDB key does, in about two minutes:
<https://www.themoviedb.org/settings/api>.

The `Poster` component does what can be done from this side: it sits the upscaled
image on a heavily blurred copy of itself, so soft edges blend into a field of
the poster's own colours rather than sitting on flat grey.

Everything _around_ the films is synthetic: the cinemas, the showtimes, the
pricing and the run dates are generated demo data.

## Proving it yourself

```bash
npm test                    # 130 API tests including real concurrent HTTP, 124 in the app
npm run verify:invariants   # 12 assertions against the live database

# Load
API_WORKERS=8 DATABASE_POOL_MAX=25 \
  RATE_LIMIT_GLOBAL_PER_MINUTE=100000 RATE_LIMIT_HOLD_PER_MINUTE=100000 \
  npm run api:cluster
npm run loadtest            # prepare → k6 → report

# Chaos (single process, so control requests reach the whole system)
CHAOS_CONTROLS_ENABLED=true SWEEPER_INTERVAL_SECONDS=10 npm run api
npm run chaos
```

The test suite runs against a real Postgres, never a mock. Among the 130:

- 60 simultaneous claims on one seat → exactly one wins, and the database agrees
- 150 users against 80 seats with overlapping blocks → no seat held twice
- 20 simultaneous retries of one request with one key → one hold
- A capture that lands after the hold expired → refund, not an oversell
- Five people racing for a promo code's last two uses → exactly two win, and the
  database agrees (the promo row is locked `FOR UPDATE` while a redemption is counted)

k6 is not committed. `brew install k6`, or drop the binary at `.tooling/k6`.

## Promo codes, saved films, best seats

- **Promo codes.** `POST /v1/promos/validate` prices a code against a hold;
  `POST /v1/checkout` takes an optional `promoCode` and re-checks it under a lock.
  The discount comes off the seat subtotal only, never the booking fee, and is
  capped so a booking always costs at least one minor unit. Redemptions are
  counted from live bookings, so a cancelled booking or a lapsed hold gives its
  use back with no job involved. Cancelling refunds `subtotal − discount`. Seeded
  codes: `WELCOME50`, `MOVIE20`, `FAMILY100`.
- **Saved films.** `PUT/DELETE /v1/users/me/watchlist/:film`, idempotent by
  composite primary key. A heart on every poster, optimistic in the app.
- **Best seats.** One tap picks the requested number of seats side by side, near
  the middle and a little behind the centre line, never across an aisle, never a
  wheelchair space, and avoiding a stranded single seat.

## What is in the box

| Layer    | Choice                                                            | Why                                                   |
| -------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| App      | Expo SDK 57, React Native 0.86, React 19, expo-router             |                                                       |
| State    | TanStack Query for server data, Zustand for session               |                                                       |
| Forms    | react-hook-form with Zod schemas shared with the API              |                                                       |
| API      | Express 5, Prisma 7, Postgres 16                                  | Row locking is the correctness primitive              |
| Cache    | Redis 7                                                           | Realtime fanout only; holds no state                  |
| Auth     | JWT access tokens plus rotating, hashed, revocable refresh tokens |                                                       |
| Payments | Mock gateway behind a swappable interface                         | Real webhook and idempotency semantics, no real money |
| Testing  | Vitest and Supertest, Jest and Testing Library                    |                                                       |
| Maps     | react-native-maps, plus a handoff to Google Maps for directions   | Works in Expo Go; navigation belongs to the phone     |
| Load     | k6, scenario committed                                            |                                                       |

## Layout

```
apps/
  mobile/           Expo app
    src/app/        Routes. One file per screen.
    src/api/        Typed HTTP client and endpoint wrappers
    src/features/   Feature state: auth, catalog, seatmap, checkout
  api/              Express server
    src/modules/
      holds/        The critical section. Everything else is surface.
      payments/     Gateway boundary, webhooks, reconciliation
      catalog/      Movies, showtimes, the seat map read
      bookings/     Tickets and signed QR payloads
      realtime/     Seat delta publisher
    src/lib/        Transaction retry, lock timeout, idempotency
    src/jobs/       The sweeper. Housekeeping, never correctness.
    src/scripts/    Invariants, chaos, load-test fixture and report
packages/
  shared/           Zod schemas and types imported by both sides
loadtest/           The k6 scenario
docs/               Architecture and the load-test report
```

## Where this is

**Done, server.** Schema and inventory model, the hold mechanic with row-level
locking, logical expiry plus sweeper, the idempotency layer, payment
orchestration with webhooks and reconciliation, the seat map and catalogue read
APIs, tickets with signed QR payloads, 51 tests, 11 invariants, the k6 scenario,
seven chaos scenarios, and the load report.

**Done, app.** The booking flow end to end: now showing with a city filter,
movie detail with showtimes by cinema and date, the seat map with selection
rules and tier pricing, the hold with its idempotency key held stable across
retries, the checkout countdown anchored to server time rather than the device
clock, the payment states including the ambiguous-submit poll, and the confirmed
ticket with a scannable QR and a share sheet, My bookings with upcoming and
past, cancellation with a quoted refund, the "how many seats?" step before the
map, and a Coming soon shelf of films that are announced but not yet on sale. A seat lost to someone else greys out in place from the 409's
`unavailableShowSeatIds` instead of bouncing the user off the screen.

**Cancellation** is part of the lifecycle, not an afterthought. The seats are
released in the same transaction that marks the booking cancelled, so no seat is
ever owned by a cancelled booking and none is orphaned while the booking still
claims it. Eight concurrent cancels of one booking produce exactly one refund,
and the invariants hold afterwards. The booking fee is retained, the deadline is
two hours before the screening (`CANCELLATION_WINDOW_MINUTES`), and both are
quoted to the user before they confirm.

The seat map draws the auditorium the seed actually describes: aisles, rows
tapering towards the screen, centred blocks, accessible seats at the aisle ends.
It windows in **both** directions — rows vertically and columns horizontally —
because virtualising rows alone does nothing for a house that is 34 rows deep
and 62 columns wide, where every row is on screen and every one of its seats
would mount. On the 2,080-seat IMAX that is 633 mounted seat views instead of
2,080.

**Design.** The app follows a BookMyShow-familiar system: a dark chrome bar in
both themes, one accent (`#F84464`) reserved for the action that commits money,
poster-forward browsing, and a seat map grouped into priced tier sections.
Recorded in [`apps/mobile/DESIGN.md`](apps/mobile/DESIGN.md), with product truth
in [`apps/mobile/PRODUCT.md`](apps/mobile/PRODUCT.md). Ratings and review
counts are real, not invented: they're computed live from the reviews users
actually submit (`PUT /v1/movies/:idOrSlug/reviews/me`), never a fabricated
number.

**Next.** A measured performance pass on the seat map on a real budget Android
phone — the grid is row- and column-virtualised React Native views today
(633 mounted cells on the 2,080-seat IMAX), which is correct but has not been
measured on-device; a Skia renderer is on the table only if that measurement
shows the RN-views approach falling short, since it would mean leaving Expo
Go for a dev-client build. A repeatable method for that measurement — dev-only
frame-timing and mounted-cell-count instrumentation, off by default — is in
[`docs/seatmap-performance.md`](docs/seatmap-performance.md). Also
outstanding: the WebSocket channel that turns the existing seat-delta
publisher into live availability, and the operator dashboard. The rendered QR
ticket and the bookings tab, both previously listed here, are done — see
"Done, app" above.

**Known limits.** The clean 5,000-user run has not been done: the generator and
the server share one laptop, whose accept queue caps at 128 connections. That
needs a deployed target. See [`docs/load-testing.md`](docs/load-testing.md).

## API

| Method   | Path                              | Notes                                                                                |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| `GET`    | `/v1/movies`                      | Now showing, filterable by city and title; `?comingSoon=true` for the announced list |
| `GET`    | `/v1/movies/:idOrSlug`            | Detail with available formats, rating average and star breakdown                     |
| `GET`    | `/v1/movies/:idOrSlug/reviews`    | Sortable and filterable by star; the caller's own review is flagged and hoisted      |
| `PUT`    | `/v1/movies/:idOrSlug/reviews/me` | Create or replace. One person, one review — posting twice edits                      |
| `DELETE` | `/v1/movies/:idOrSlug/reviews/me` | Removes the caller's review                                                          |
| `GET`    | `/v1/cities`                      | Cities with a bookable venue                                                         |
| `GET`    | `/v1/cinemas`                     | Venue directory. `?lat=&lng=` adds a distance to every entry and sorts by it         |
| `GET`    | `/v1/cinemas/:idOrSlug`           | One venue: address, coordinate, phone, facilities                                    |
| `GET`    | `/v1/cinema-brands`               | The chains represented, for the filter chips                                         |
| `GET`    | `/v1/showtimes`                   | Grouped by cinema, with an availability band                                         |
| `GET`    | `/v1/showtimes/:id/seatmap`       | The whole map. Auth optional; a holder sees their own seats as theirs.               |
| `POST`   | `/v1/showtimes/:id/holds`         | **Requires `Idempotency-Key`**                                                       |
| `GET`    | `/v1/holds/:id`                   | Server-authoritative expiry for the countdown                                        |
| `DELETE` | `/v1/holds/:id`                   | Voluntary release                                                                    |
| `POST`   | `/v1/checkout`                    | **Requires `Idempotency-Key`**                                                       |
| `GET`    | `/v1/payments/:id`                | Poll after an ambiguous submit                                                       |
| `POST`   | `/v1/payments/webhook`            | HMAC-verified, deduplicated by event id                                              |
| `GET`    | `/v1/bookings`                    | Upcoming and past                                                                    |
| `GET`    | `/v1/bookings/reference/:ref`     | Counter lookup                                                                       |
| `GET`    | `/v1/bookings/:id/cancellation`   | Quotes the refund and the deadline before the user commits                           |
| `POST`   | `/v1/bookings/:id/cancel`         | Releases the seats and refunds the seat money; the booking fee is kept               |

Every non-2xx response has the same body shape. Clients switch on
`error.code`, never on `error.message`. A seat conflict carries the offending
ids in `error.details.unavailableShowSeatIds`, so the map can grey exactly
those seats out in place instead of navigating away.

## Commands

| Command                                        | What it does                                |
| ---------------------------------------------- | ------------------------------------------- |
| `npm run dev`                                  | API and Expo together                       |
| `npm run api`                                  | API only, single process, reload on save    |
| `npm run api:cluster`                          | One worker per core, for load runs          |
| `npm run mobile`                               | Expo only                                   |
| `npm test`                                     | Every test suite in the workspace           |
| `npm run typecheck`                            | TypeScript across all three packages        |
| `npm run verify:invariants`                    | The eleven correctness assertions           |
| `npm run loadtest`                             | Prepare, run k6, report                     |
| `npm run chaos`                                | The seven failure scenarios                 |
| `npm run infra` / `infra:down`                 | Postgres and Redis in Docker, if you use it |
| `npm run db:migrate` / `db:seed` / `db:studio` | Database                                    |

## Running the app on a device

Press `i` for the iOS simulator, `a` for Android, or `w` for the browser once
Expo is running.

**The app works out the API address itself, so a phone does not need editing.**
`localhost` is the single most common reason a device boots straight to a
network error: on a phone it means _the phone_, which is not running the API.
Nothing in the bundle can say so, so the app just reports the server as down
while the server is fine.

Metro already knows the right answer. It served the bundle from the host
machine's LAN address, so that address is reachable from the device by
construction — otherwise the app would not be running at all. `lib/config.ts`
takes the host from there and keeps only the port from configuration:

| Where it is running     | What it talks to                                          |
| ----------------------- | --------------------------------------------------------- |
| Physical phone, Expo Go | The dev server's LAN host, e.g. `http://10.7.23.150:4000` |
| Android emulator        | `10.0.2.2`, the emulator's alias for the host             |
| iOS simulator and web   | `localhost`, which genuinely is the host                  |

A non-loopback `EXPO_PUBLIC_API_URL` — a staging server, a tunnel — always wins,
and is never second-guessed. A loopback one contributes its port and nothing
else. When the server really is unreachable, the error state prints the address
that was tried and where it came from, which in development is usually the whole
diagnosis.

Anything prefixed `EXPO_PUBLIC_` is inlined into the JavaScript bundle, so never
put a secret there.

### Maps and location

Cinemas are shown on a real map via `react-native-maps` — Google on Android,
Apple's own on iOS — which needs no setup in Expo Go. A standalone Android build
needs a Google Maps key; `app.json` reads it from `GOOGLE_MAPS_ANDROID_KEY` at
prebuild time.

The app draws a map to _show_ where a venue is; it never navigates. Directions
hand off to Google Maps, which has live traffic, the user's saved places and far
better coverage of Indian street addresses than anything shipped here.

Location is requested only when the user taps **Near me**, never on launch. A
prompt before someone has seen what the app does is the prompt most people deny,
and a denial is sticky.

## How auth works

1. Sign-up or sign-in returns a short-lived access token (15 minutes) and a
   long-lived refresh token (30 days).
2. Both are written to the iOS keychain or Android keystore through
   `expo-secure-store`. Web falls back to `localStorage`.
3. When a request comes back 401, the API client silently refreshes once and
   replays the request. Parallel 401s share a single refresh.
4. Refresh tokens rotate on every use and are stored only as SHA-256 hashes. If
   an already-revoked token is ever presented, every session for that user is
   revoked, because that is what a stolen token looks like.

## Adding a feature

1. Put the request and response schemas in `packages/shared`.
2. Add a service and route under `apps/api/src/modules/<feature>/`, and a test
   beside them.
3. Add the endpoint wrapper in `apps/mobile/src/api/`.
4. Add the screen as a file under `apps/mobile/src/app/`.

Because step 1 is shared, a change to a field name breaks the build on both
sides at once rather than at runtime.

## Notes

- Keep this project outside iCloud-synced folders such as Desktop and Documents.
  `node_modules` and iCloud do not mix, and eviction can empty files in place.
- `apps/api/.env` holds real secrets and is git-ignored. Never commit it.
- `CHAOS_CONTROLS_ENABLED` exposes an unauthenticated endpoint that makes the
  mock gateway misbehave. The API refuses to boot with it set in production.
