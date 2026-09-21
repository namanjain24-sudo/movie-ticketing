import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';
import exec from 'k6/execution';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

/**
 * Opening-night rush.
 *
 * Five thousand users arrive within thirty seconds and fight over three
 * hundred seats. The point is not throughput. The point is that when the dust
 * settles, exactly the seats that exist have been sold, nobody was charged
 * twice, and no hold was left orphaned.
 *
 * k6 measures latency and error mix. It deliberately does not decide whether
 * the run passed: that is the invariant script's job, run against the database
 * afterwards, because a load generator can only see the answers the server
 * chose to give it.
 *
 * Run it with `npm run loadtest` from the repo root.
 */

const fixture = new SharedArray('fixture', () => [JSON.parse(open('./fixture.json'))])[0];

const BASE = __ENV.BASE_URL || fixture.baseUrl;
const SHOWTIME = fixture.showtimeId;

// --- Metrics ----------------------------------------------------------------
// Named for what a reader of the report wants to know, not for HTTP verbs.

const holdsCreated = new Counter('holds_created');
const holdsConflicted = new Counter('holds_conflicted');
const holdsContended = new Counter('holds_contended_retryable');
const holdsRetried = new Counter('holds_retried_same_key');
const checkoutsStarted = new Counter('checkouts_started');
const checkoutsRetried = new Counter('checkouts_retried_same_key');
const paymentsConfirmed = new Counter('payments_confirmed');
const paymentsDeclined = new Counter('payments_declined');
const holdsAbandoned = new Counter('holds_abandoned');
const soldOut = new Counter('sold_out_responses');
/** Anything the client did not expect. This is the number that must be zero. */
const unexpected = new Counter('unexpected_responses');
const unexpectedRate = new Rate('unexpected_rate');

const holdLatency = new Trend('hold_latency_ms', true);
const seatmapLatency = new Trend('seatmap_latency_ms', true);
const checkoutLatency = new Trend('checkout_latency_ms', true);

export const options = {
  scenarios: {
    opening_night: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Number(__ENV.VUS || 5000) },
        { duration: '30s', target: Number(__ENV.VUS || 5000) },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '20s',
    },
  },
  thresholds: {
    // The headline requirement. A 409 for a taken seat is a correct answer,
    // not an error, so it is excluded from this.
    unexpected_rate: ['rate<0.001'],
    hold_latency_ms: ['p(99)<200'],
    seatmap_latency_ms: ['p(95)<300'],
  },
  // Conflicts and declines are expected outcomes of this scenario. Marking
  // them as successes here keeps k6's own error rate meaningful: anything it
  // still counts as failed is a genuine surprise.
  responseCallback: http.expectedStatuses(200, 201, 204, 402, 409, 410, 422),
  discardResponseBodies: false,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function authHeaders(token, idempotencyKey) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return headers;
}

export default function () {
  // One token per virtual user, cycling if the pool is smaller than the VU
  // count.
  const token = fixture.tokens[(exec.vu.idInTest - 1) % fixture.tokens.length];

  // 1. Browse the seat map.
  const mapRes = http.get(`${BASE}/v1/showtimes/${SHOWTIME}/seatmap`, {
    headers: authHeaders(token),
    tags: { name: 'seatmap' },
  });
  seatmapLatency.add(mapRes.timings.duration);

  if (mapRes.status !== 200) {
    unexpected.add(1);
    unexpectedRate.add(true);
    return;
  }
  unexpectedRate.add(false);

  const map = mapRes.json();
  const available = map.seats.filter((s) => s.status === 'AVAILABLE');
  if (available.length === 0) {
    // A real user who finds a sold-out house leaves. Re-polling the map in a
    // tight loop would load the server with traffic no client generates, and
    // would quietly turn this into a benchmark of JSON serialisation.
    soldOut.add(1);
    sleep(5);
    return;
  }

  // 2. Pick one to four seats together, the way a real group books.
  const wanted = 1 + (exec.vu.idInTest % 4);
  const start = Math.floor(Math.random() * Math.max(1, available.length - wanted));
  const seatIds = available.slice(start, start + wanted).map((s) => s.id);
  if (seatIds.length === 0) return;

  // 3. Hold. One in ten users retries with the same key, which must never
  //    produce a second hold.
  const holdKey = uuidv4();
  const holdBody = JSON.stringify({ showSeatIds: seatIds });
  let holdRes = http.post(`${BASE}/v1/showtimes/${SHOWTIME}/holds`, holdBody, {
    headers: authHeaders(token, holdKey),
    tags: { name: 'hold' },
  });
  holdLatency.add(holdRes.timings.duration);

  if (Math.random() < 0.1) {
    holdsRetried.add(1);
    const retry = http.post(`${BASE}/v1/showtimes/${SHOWTIME}/holds`, holdBody, {
      headers: authHeaders(token, holdKey),
      tags: { name: 'hold_retry' },
    });
    // A retry may legitimately be told the first attempt is still running.
    if (retry.status === 201) holdRes = retry;
  }

  if (holdRes.status === 409) {
    // Two different 409s: the seat is gone, or too many people are contending
    // for it right now. Only the first is final.
    const code = (holdRes.json() || {}).error?.code;
    if (code === 'SEATS_CONTENDED') holdsContended.add(1);
    else holdsConflicted.add(1);
    unexpectedRate.add(false);
    sleep(0.5);
    return;
  }
  if (holdRes.status !== 201) {
    unexpected.add(1);
    unexpectedRate.add(true);
    return;
  }

  holdsCreated.add(1);
  unexpectedRate.add(false);
  const hold = holdRes.json();

  check(hold, {
    'hold covers every requested seat': (h) => h.seats.length === seatIds.length,
    'hold has a server-side expiry': (h) => Boolean(h.expiresAt),
  });

  // A moment of thinking, the way a user reads the total before paying.
  sleep(0.3 + Math.random() * 0.7);

  // 4. Three in ten abandon. Releasing is what a real client does on back.
  if (Math.random() < 0.3) {
    holdsAbandoned.add(1);
    http.del(`${BASE}/v1/holds/${hold.id}`, null, {
      headers: authHeaders(token),
      tags: { name: 'release' },
    });
    return;
  }

  // 5. Pay.
  const payKey = uuidv4();
  const payBody = JSON.stringify({ holdId: hold.id, method: 'CARD' });
  const checkoutRes = http.post(`${BASE}/v1/checkout`, payBody, {
    headers: authHeaders(token, payKey),
    tags: { name: 'checkout' },
  });
  checkoutLatency.add(checkoutRes.timings.duration);

  if (Math.random() < 0.1) {
    checkoutsRetried.add(1);
    http.post(`${BASE}/v1/checkout`, payBody, {
      headers: authHeaders(token, payKey),
      tags: { name: 'checkout_retry' },
    });
  }

  if (checkoutRes.status === 410) {
    // The hold ran out while the user was deciding. A correct answer.
    unexpectedRate.add(false);
    return;
  }
  if (checkoutRes.status !== 201) {
    unexpected.add(1);
    unexpectedRate.add(true);
    return;
  }

  checkoutsStarted.add(1);
  unexpectedRate.add(false);
  const checkout = checkoutRes.json();

  // 6. Poll for the outcome, the way the "confirming" screen does.
  for (let attempt = 0; attempt < 10; attempt++) {
    sleep(0.4);
    const statusRes = http.get(`${BASE}/v1/payments/${checkout.paymentId}`, {
      headers: authHeaders(token),
      tags: { name: 'payment_status' },
    });
    if (statusRes.status !== 200) {
      unexpected.add(1);
      unexpectedRate.add(true);
      return;
    }
    const status = statusRes.json();
    if (status.bookingStatus === 'CONFIRMED') {
      paymentsConfirmed.add(1);
      check(status, { 'confirmed booking has a reference': (s) => Boolean(s.reference) });
      return;
    }
    if (status.status === 'FAILED' || status.bookingStatus === 'FAILED') {
      paymentsDeclined.add(1);
      return;
    }
  }
}

export function handleSummary(data) {
  const line = (label, value) => `  ${label.padEnd(30)} ${value}`;
  const m = (name) => (data.metrics[name] ? data.metrics[name].values.count : 0);
  const p99 = (name) =>
    data.metrics[name] ? `${data.metrics[name].values['p(99)'].toFixed(1)} ms` : 'n/a';

  const text = [
    '',
    'Opening-night rush',
    '─'.repeat(56),
    line('Inventory', `${fixture.inventory} seats`),
    line('Holds created', m('holds_created')),
    line('Holds conflicted (seat gone)', m('holds_conflicted')),
    line('Holds contended (retryable)', m('holds_contended_retryable')),
    line('Holds abandoned', m('holds_abandoned')),
    line(
      'Retries with the same key',
      m('holds_retried_same_key') + m('checkouts_retried_same_key'),
    ),
    line('Checkouts started', m('checkouts_started')),
    line('Payments confirmed', m('payments_confirmed')),
    line('Payments declined', m('payments_declined')),
    line('Sold-out responses', m('sold_out_responses')),
    line('Unexpected responses', m('unexpected_responses')),
    '',
    line('Hold p99', p99('hold_latency_ms')),
    line('Seat map p99', p99('seatmap_latency_ms')),
    line('Checkout p99', p99('checkout_latency_ms')),
    '',
    'k6 measured the responses. Whether the run was correct is decided by',
    '`npm run verify:invariants`, which reads the database.',
    '',
  ].join('\n');

  return {
    stdout: text,
    'loadtest/results/last-run.json': JSON.stringify(data, null, 2),
  };
}
