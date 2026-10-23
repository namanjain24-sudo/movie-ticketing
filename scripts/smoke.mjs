/**
 * Walks the whole demo against a running API, the way a demo actually goes:
 * sign in, find something on today, hold two seats, apply a promo, pay, wait
 * for the gateway webhook, read the ticket back.
 *
 * Run it before showing the app to anyone. A green run means the host is
 * awake, the schedule has not run out, the booking mechanic works and the
 * reset endpoint is still enumeration safe. Anything red is a thing somebody
 * would have hit in front of an audience.
 *
 *   node scripts/smoke.mjs
 *   API_URL=http://localhost:4000/v1 node scripts/smoke.mjs
 *
 * It books a real seat on whatever it is pointed at, which on the demo
 * database is the point.
 */
const API = process.env.API_URL ?? 'https://boxoffice-api-i1ra.onrender.com/v1';
const key = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
let token = null;
const step = [];

async function call(path, { method = 'GET', body, idem } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idem) headers['Idempotency-Key'] = idem;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const check = (name, ok, detail = '') => {
  step.push(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) process.exitCode = 1;
};

// A cold start on the free plan takes the better part of a minute, and the
// first call below would otherwise look like a failure rather than a wait.
process.stdout.write('waking the server… ');
const t0 = Date.now();
await fetch(API.replace(/\/v1$/, '') + '/health/ready').catch(() => {});
console.log(`${Math.round((Date.now() - t0) / 1000)}s\n`);

// 1. Sign in as the documented demo account.
const login = await call('/auth/login', {
  method: 'POST',
  body: { email: 'demo@example.com', password: 'DemoPassw0rd' },
});
check('demo login', login.status === 200, `HTTP ${login.status}`);
token = login.json?.tokens?.accessToken;
if (!token) {
  console.log(step.join('\n'));
  process.exit(1);
}

// 2. Catalogue.
const movies = await call('/movies?limit=5');
const list = movies.json?.movies ?? [];
check('movies now showing', movies.status === 200 && list.length > 0, `${list.length} films`);

// 3. A bookable showtime today.
const today = new Date().toISOString().slice(0, 10);
let show = null;
for (const m of list) {
  const r = await call(`/showtimes?movieId=${m.id}&date=${today}`);
  const all = (r.json?.cinemas ?? []).flatMap((c) => c.showtimes ?? []);
  const usable = all.filter((s) => new Date(s.salesCloseAt).getTime() > Date.now() + 45 * 60_000);
  if (usable.length) {
    show = usable[0];
    break;
  }
}
check('a bookable showtime today', show !== null, show ? show.startsAt : 'none found');
if (!show) {
  console.log(step.join('\n'));
  process.exit(1);
}

// 4. Seat map.
const map = await call(`/showtimes/${show.id}/seatmap`);
const seats = map.json?.seats ?? [];
const free = seats.filter((s) => s.status === 'AVAILABLE');
check(
  'seat map',
  map.status === 200 && free.length > 0,
  `${seats.length} seats, ${free.length} free`,
);

// 5. Hold two.
const want = free.slice(0, 2).map((s) => s.id);
const hold = await call(`/showtimes/${show.id}/holds`, {
  method: 'POST',
  body: { showSeatIds: want },
  idem: key('hold'),
});
check('hold two seats', hold.status === 201, `HTTP ${hold.status}`);
const holdId = hold.json?.id;
if (!holdId) {
  console.log(step.join('\n'));
  process.exit(1);
}

// 6. Promo validates server side.
//
// Each code is once per account, so on a database this has already run
// against, the honest result is a refusal. That still proves the thing worth
// proving: the server decides, not the client. Only an unexpected status is a
// failure.
const promo = await call('/promos/validate', {
  method: 'POST',
  body: { holdId, code: 'WELCOME50' },
});
const promoUsable = promo.status === 200;
const promoSpent =
  promo.status === 422 && promo.json?.error?.details?.reason?.[0] === 'ALREADY_USED';
check(
  'promo checked by the server',
  promoUsable || promoSpent,
  promoUsable ? `discount ${promo.json?.discountMinor}` : 'already used by this account',
);

// 7. Checkout, with the code only if this account may still use it.
const checkout = await call('/checkout', {
  method: 'POST',
  body: { holdId, method: 'CARD', ...(promoUsable ? { promoCode: 'WELCOME50' } : {}) },
  idem: key('pay'),
});
check('checkout accepted', checkout.status === 201, `HTTP ${checkout.status}`);
const paymentId = checkout.json?.paymentId;

// 8. Webhook confirms it.
let settled = null;
for (let i = 0; i < 25 && paymentId; i++) {
  const r = await call(`/payments/${paymentId}`);
  if (['CONFIRMED', 'FAILED', 'CANCELLED'].includes(r.json?.bookingStatus)) {
    settled = r.json;
    break;
  }
  await new Promise((r2) => setTimeout(r2, 1500));
}
check(
  'payment confirmed by webhook',
  settled?.bookingStatus === 'CONFIRMED',
  settled?.reference ?? settled?.bookingStatus ?? 'never settled',
);

// 9. The ticket is readable.
if (settled?.reference) {
  const t = await call(`/bookings/reference/${settled.reference}`);
  check(
    'ticket readable',
    t.status === 200 && Boolean(t.json?.qrPayload ?? t.json?.reference),
    `HTTP ${t.status}`,
  );
}

// 10. Reset endpoint is enumeration safe.
const a = await call('/auth/forgot-password', {
  method: 'POST',
  body: { email: 'demo@example.com' },
});
const b = await call('/auth/forgot-password', {
  method: 'POST',
  body: { email: 'nobody-here-zz@example.com' },
});
check(
  'forgot-password says the same either way',
  a.status === b.status && JSON.stringify(a.json) === JSON.stringify(b.json),
  `HTTP ${a.status}`,
);

console.log(step.join('\n'));
