import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../db';
import { verifyInvariants } from './verify-invariants';

/**
 * Chaos scenarios, run against a live API while real bookings are in flight.
 *
 * The question each one asks is the same: after this failure, is the data
 * still correct? Not "did the request succeed" — requests are allowed to fail
 * during an outage. What is never allowed is a seat sold twice, a booking
 * confirmed without a payment, or a payment captured without a booking.
 *
 * Every scenario states what it expects before it runs, and the invariant
 * script decides whether it got it. Expectations written after the fact are
 * not expectations.
 *
 * Prerequisites: Postgres and Redis running (`docker compose up -d` or
 * `npm run infra:local`), a running API, and
 * `npm run loadtest:prepare`.
 */

interface Scenario {
  name: string;
  expected: string;
  run: (ctx: Context) => Promise<string>;
}

interface Context {
  baseUrl: string;
  showtimeId: string;
  tokens: string[];
  seatIds: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function docker(...args: string[]): void {
  execFileSync('docker', args, { stdio: 'ignore' });
}

/**
 * Restarts Redis whichever way it is running: the compose container if Docker is
 * available, otherwise a local server (`scripts/local-infra.sh`, or Homebrew).
 * The scenario is about the outage, not about how the server was installed.
 */
function restartRedis(): void {
  try {
    docker('restart', 'ticketing-redis');
    return;
  } catch {
    // No Docker, or no such container: fall through to a local server.
  }
  const port = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port || '6379';
  try {
    execFileSync('redis-cli', ['-p', port, 'shutdown', 'nosave'], { stdio: 'ignore' });
  } catch {
    // redis-cli reports an error when the server closes the connection on the
    // way down, which is exactly what a successful shutdown looks like.
  }
  execFileSync('redis-server', ['--port', port, '--daemonize', 'yes'], { stdio: 'ignore' });
}

// ---------------------------------------------------------------------------
// A small booking client, so the scenarios exercise the real HTTP surface.
// ---------------------------------------------------------------------------

interface Attempt {
  ok: boolean;
  status: number;
  code?: string;
}

async function attemptBooking(ctx: Context, index: number): Promise<Attempt> {
  const token = ctx.tokens[index % ctx.tokens.length]!;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': `chaos-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
  };

  try {
    const mapRes = await fetch(`${ctx.baseUrl}/v1/showtimes/${ctx.showtimeId}/seatmap`, {
      headers: { Authorization: headers.Authorization },
    });
    if (!mapRes.ok) return { ok: false, status: mapRes.status };

    const map = (await mapRes.json()) as { seats: { id: string; status: string }[] };
    const free = map.seats.filter((s) => s.status === 'AVAILABLE');
    if (free.length === 0) return { ok: false, status: 0, code: 'SOLD_OUT' };

    const seat = free[Math.floor(Math.random() * free.length)]!;
    const holdRes = await fetch(`${ctx.baseUrl}/v1/showtimes/${ctx.showtimeId}/holds`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ showSeatIds: [seat.id] }),
    });

    if (holdRes.status !== 201) {
      const body = (await holdRes.json().catch(() => ({}))) as { error?: { code?: string } };
      return { ok: false, status: holdRes.status, code: body.error?.code };
    }

    const hold = (await holdRes.json()) as { id: string };
    const payRes = await fetch(`${ctx.baseUrl}/v1/checkout`, {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': `${headers['Idempotency-Key']}-pay` },
      body: JSON.stringify({ holdId: hold.id, method: 'CARD' }),
    });
    return { ok: payRes.status === 201, status: payRes.status };
  } catch (err) {
    // A connection refused during an outage is an expected outcome, not a
    // scenario failure.
    return { ok: false, status: 0, code: err instanceof Error ? err.name : 'NETWORK' };
  }
}

/** Keeps traffic flowing while a scenario breaks something underneath it. */
function startTraffic(ctx: Context): { stop: () => Promise<Attempt[]> } {
  const results: Attempt[] = [];
  let running = true;
  let counter = 0;

  const workers = Array.from({ length: 8 }, async () => {
    while (running) {
      results.push(await attemptBooking(ctx, counter++));
      await sleep(40);
    }
  });

  return {
    async stop() {
      running = false;
      await Promise.all(workers);
      return results;
    },
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/**
 * Puts the showtime back to full inventory. Run before every scenario: a
 * scenario that quietly ran against a sold-out house would report reassuring
 * numbers that mean nothing.
 */
async function resetInventory(ctx: Context): Promise<void> {
  await prisma.payment.deleteMany({ where: { booking: { showtimeId: ctx.showtimeId } } });
  await prisma.showSeat.updateMany({
    where: { showtimeId: ctx.showtimeId },
    data: { state: 'AVAILABLE', holdId: null, holdExpiresAt: null, bookingId: null },
  });
  await prisma.booking.deleteMany({ where: { showtimeId: ctx.showtimeId } });
  await prisma.hold.deleteMany({ where: { showtimeId: ctx.showtimeId } });
  await prisma.webhookEvent.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
}

/** Drives the mock gateway through the guarded control endpoint. */
async function setGateway(ctx: Context, controls: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${ctx.baseUrl}/v1/_chaos/gateway`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(controls),
  });
  if (!res.ok) {
    throw new Error(
      `Chaos controls are not reachable (${res.status}). Start the API with ` +
        'CHAOS_CONTROLS_ENABLED=true, as a single process rather than the cluster.',
    );
  }
}

async function resetGateway(ctx: Context): Promise<void> {
  await fetch(`${ctx.baseUrl}/v1/_chaos/reset`, { method: 'POST' }).catch(() => {});
}

/**
 * Waits until no payment is still in flight, so counts are not read too early.
 * With callbacks dropped this only clears once the API's sweeper runs its
 * reconciliation pass, which is exactly what the dropped-webhook scenario is
 * waiting for.
 */
async function settle(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pending = await prisma.payment.count({
      where: { status: { in: ['PENDING', 'AUTHORIZED'] } },
    });
    if (pending === 0) return;
    await sleep(200);
  }
}

const SCENARIOS: Scenario[] = [
  {
    name: 'redis-restart',
    expected:
      'Bookings keep succeeding through the restart. Realtime fanout pauses and resumes. ' +
      'Nothing is lost, because Redis holds no seat state.',
    async run(ctx) {
      const traffic = startTraffic(ctx);
      await sleep(2_000);

      restartRedis();
      await sleep(5_000);

      const results = await traffic.stop();
      await settle();
      const succeeded = results.filter((r) => r.ok).length;
      const soldOut = results.filter((r) => r.code === 'SOLD_OUT').length;
      const networkErrors = results.filter((r) => r.code === 'NETWORK').length;
      const attempted = results.length - soldOut;

      return `${succeeded}/${attempted} bookings completed across the restart (${soldOut} later attempts found the house full), ${networkErrors} network errors`;
    },
  },
  {
    name: 'postgres-connections-dropped',
    expected:
      'Transactions in flight are killed and roll back whole. Requests fail while the pool ' +
      'reconnects, then service resumes. No partial hold and no booking without a payment.',
    async run(ctx) {
      const traffic = startTraffic(ctx);
      await sleep(2_000);

      const killed = await prisma.$queryRaw<{ pid: number }[]>`
        SELECT pg_terminate_backend(pid) AS pid
        FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
      `;

      // Long enough for the pool to notice, reconnect and serve again, which
      // is the half of this scenario that matters.
      await sleep(8_000);

      const results = await traffic.stop();
      const failed = results.filter((r) => !r.ok && r.code !== 'SOLD_OUT').length;

      // How long until the service is healthy again is the other half of this
      // scenario, and it is a number rather than a yes or no.
      const recoveryStarted = Date.now();
      let healthyAfterMs = -1;
      while (Date.now() - recoveryStarted < 30_000) {
        const health = await fetch(`${ctx.baseUrl}/health/ready`).catch(() => null);
        if (health?.ok) {
          healthyAfterMs = Date.now() - recoveryStarted;
          break;
        }
        await sleep(250);
      }

      // Recovery is asserted with fresh requests rather than inferred from the
      // tail of the background traffic, whose timing the outage itself
      // distorts. Inventory is restocked first: the traffic above sells the
      // house out, and a burst that fails because there are no seats left
      // would look exactly like a burst that fails because the database is
      // still down.
      await resetInventory(ctx);
      const recovery: Attempt[] = [];
      for (let i = 0; i < 10; i++) recovery.push(await attemptBooking(ctx, 10_000 + i));
      await settle();
      const recovered = recovery.filter((r) => r.ok).length;
      const stillFailing = recovery.filter((r) => !r.ok);

      const why = stillFailing.length
        ? `; failures reported ${[...new Set(stillFailing.map((r) => r.code ?? r.status))].join(', ')}`
        : '';

      return `${killed.length} backends terminated, ${failed} in-flight requests failed, healthy again after ${healthyAfterMs} ms, ${recovered}/10 fresh bookings succeeded${why}`;
    },
  },
  {
    name: 'slow-payment-gateway',
    expected:
      'Checkout still returns in tens of milliseconds with a five-second gateway, because the ' +
      'provider call happens after the seat transaction commits. Confirmation arrives late; ' +
      'seat locks are never held waiting for it.',
    async run(ctx) {
      await setGateway(ctx, { extraLatencyMs: 5_000, forceOutcome: 'SUCCESS' });

      const started = Date.now();
      const results: Attempt[] = [];
      for (let i = 0; i < 20; i++) results.push(await attemptBooking(ctx, i));
      const perBooking = Math.round((Date.now() - started) / results.length);

      const succeeded = results.filter((r) => r.ok).length;
      const confirmedImmediately = await prisma.booking.count({
        where: { showtimeId: ctx.showtimeId, status: 'CONFIRMED' },
      });

      await settle(30_000);
      const confirmedEventually = await prisma.booking.count({
        where: { showtimeId: ctx.showtimeId, status: 'CONFIRMED' },
      });

      return `${succeeded}/20 checkouts returned in ${perBooking} ms each against a 5 s gateway; ${confirmedImmediately} confirmed at return, ${confirmedEventually} once the gateway replied`;
    },
  },
  {
    name: 'duplicate-webhooks',
    expected: 'Every callback is delivered twice. Each payment is captured exactly once.',
    async run(ctx) {
      await setGateway(ctx, { duplicateWebhooks: true, forceOutcome: 'SUCCESS' });

      const results: Attempt[] = [];
      for (let i = 0; i < 25; i++) results.push(await attemptBooking(ctx, i));
      await settle();

      const doubles = await prisma.$queryRaw<{ bookingId: string }[]>`
        SELECT "bookingId" FROM "Payment"
        WHERE status = 'CAPTURED'
        GROUP BY "bookingId" HAVING COUNT(*) > 1
      `;
      const events = await prisma.webhookEvent.count();
      const captured = await prisma.payment.count({ where: { status: 'CAPTURED' } });

      return `${results.filter((r) => r.ok).length} checkouts, ${events} distinct webhook events stored from twice as many deliveries, ${captured} captures, ${doubles.length} double charges`;
    },
  },
  {
    name: 'out-of-order-webhooks',
    expected:
      'The capture arrives before the authorisation. The booking still confirms, and the late ' +
      'authorisation does not walk the payment back to a lesser state.',
    async run(ctx) {
      await setGateway(ctx, { outOfOrderWebhooks: true, forceOutcome: 'SUCCESS' });

      const results: Attempt[] = [];
      for (let i = 0; i < 25; i++) results.push(await attemptBooking(ctx, i));
      await settle();

      const confirmed = await prisma.booking.count({
        where: { showtimeId: ctx.showtimeId, status: 'CONFIRMED' },
      });
      const downgraded = await prisma.payment.count({
        where: { booking: { status: 'CONFIRMED' }, status: { not: 'CAPTURED' } },
      });

      return `${results.filter((r) => r.ok).length} checkouts, ${confirmed} confirmed despite reversed callbacks, ${downgraded} payments left below CAPTURED`;
    },
  },
  {
    name: 'dropped-webhooks',
    expected:
      'No callback ever arrives. Reconciliation asks the gateway directly and confirms the ' +
      'bookings that were genuinely paid for.',
    async run(ctx) {
      await setGateway(ctx, { dropWebhooks: true, forceOutcome: 'SUCCESS' });

      const results: Attempt[] = [];
      for (let i = 0; i < 20; i++) results.push(await attemptBooking(ctx, i));
      await sleep(2_000);

      const strandedBefore = await prisma.booking.count({
        where: { showtimeId: ctx.showtimeId, status: 'PENDING' },
      });

      // Reconciliation has to run inside the API process, because that is
      // where the gateway lives. Calling it from here would query this
      // script's own empty copy of the mock and prove nothing.
      await settle(90_000);

      const confirmed = await prisma.booking.count({
        where: { showtimeId: ctx.showtimeId, status: 'CONFIRMED' },
      });

      return `${results.filter((r) => r.ok).length} checkouts, ${strandedBefore} stranded with no callback, ${confirmed} confirmed by the API's reconciliation pass`;
    },
  },
  {
    name: 'sweeper-disabled',
    expected:
      'With no sweep, expired holds are still treated as available. Expiry is decided on the ' +
      'read path, so no background job is load-bearing for correctness.',
    async run(ctx) {
      await setGateway(ctx, { forceOutcome: 'SUCCESS' });
      for (let i = 0; i < 10; i++) await attemptBooking(ctx, i);

      // Age every live hold past its deadline, and deliberately do not sweep.
      const past = new Date(Date.now() - 1_000);
      const aged = await prisma.hold.updateMany({
        where: { showtimeId: ctx.showtimeId, status: 'ACTIVE' },
        data: { expiresAt: past },
      });
      await prisma.showSeat.updateMany({
        where: { showtimeId: ctx.showtimeId, state: 'HELD' },
        data: { holdExpiresAt: past },
      });

      const stillHeldInDb = await prisma.showSeat.count({
        where: { showtimeId: ctx.showtimeId, state: 'HELD' },
      });
      const mapRes = await fetch(`${ctx.baseUrl}/v1/showtimes/${ctx.showtimeId}/seatmap`);
      const map = (await mapRes.json()) as { seats: { status: string }[] };
      const offered = map.seats.filter((s) => s.status === 'AVAILABLE').length;

      // And the seats can actually be taken again, not merely displayed as free.
      const rebooked = await attemptBooking(ctx, 999);

      return `${aged.count} holds aged out, ${stillHeldInDb} rows still read HELD, the map offers ${offered} seats, and re-holding one ${rebooked.ok || rebooked.status === 201 ? 'succeeded' : `returned ${rebooked.status}`}`;
    },
  },
];

// ---------------------------------------------------------------------------

async function main() {
  const fixturePath = resolve(import.meta.dirname, '../../../../loadtest/fixture.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    baseUrl: string;
    showtimeId: string;
    tokens: string[];
    seatIds: string[];
  };

  const ctx: Context = {
    baseUrl: process.env.CHAOS_BASE_URL ?? fixture.baseUrl,
    showtimeId: fixture.showtimeId,
    tokens: fixture.tokens.slice(0, 200),
    seatIds: fixture.seatIds,
  };

  const only = process.argv[2];
  const scenarios = only ? SCENARIOS.filter((s) => s.name === only) : SCENARIOS;
  if (scenarios.length === 0) {
    console.error(`No scenario named "${only}". Known: ${SCENARIOS.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }

  let failures = 0;

  for (const scenario of scenarios) {
    console.log('');
    console.log('═'.repeat(76));
    console.log(scenario.name);
    console.log('═'.repeat(76));
    console.log(`Expected  ${scenario.expected}`);

    await resetInventory(ctx);
    await resetGateway(ctx);
    const observed = await scenario.run(ctx);
    console.log(`Observed  ${observed}`);

    const violations = await verifyInvariants();
    if (violations.length === 0) {
      console.log('Verdict   PASS  every invariant still holds');
    } else {
      failures++;
      console.log(`Verdict   FAIL  ${violations.length} invariant(s) violated`);
      for (const v of violations) console.log(`            ${v.check}: ${v.count} row(s)`);
    }
  }

  await resetGateway(ctx);

  console.log('');
  console.log('═'.repeat(76));
  console.log(
    failures === 0
      ? `${scenarios.length}/${scenarios.length} scenarios left the data correct.`
      : `${failures} scenario(s) corrupted state.`,
  );
  if (failures > 0) process.exitCode = 1;

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
