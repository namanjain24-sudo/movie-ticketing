/**
 * Wakes the demo API and waits until it is actually serving.
 *
 * Run this a minute before showing the app to anyone. Render's free plan
 * stops the service after fifteen idle minutes, and the difference it makes
 * is not subtle: measured on this deployment, the same sign-in takes 55
 * seconds against a sleeping host and 6 seconds against a waking one. The
 * first person to open the app is the one who pays that, and at a demo the
 * first person is usually the one you least want to keep waiting.
 *
 * Once it is up, ordinary use keeps it up: fifteen minutes is a long idle
 * gap when a room is booking seats.
 *
 *   npm run wake
 *   API_URL=http://localhost:4000 npm run wake
 */
const API = (process.env.API_URL ?? 'https://boxoffice-api-i1ra.onrender.com').replace(/\/+$/, '');
const BUDGET_MS = 180_000;
const PROBE_TIMEOUT_MS = 10_000;
const GAP_MS = 2_000;

async function probe(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${path}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

const started = Date.now();
const elapsed = () => Math.round((Date.now() - started) / 1000);

process.stdout.write(`waking ${API}`);

let attempt = 0;
for (;;) {
  attempt += 1;
  // `/health/live` answers as soon as the socket is open; `/health/ready`
  // also checks the database, which is what the app's first real request
  // needs. Waiting for ready means this reports "up" only when it is true.
  const status = await probe('/health/ready');
  if (status === 200) {
    process.stdout.write(`\nup after ${elapsed()}s, ${attempt} probe${attempt === 1 ? '' : 's'}\n`);
    process.stdout.write('It stays up for fifteen minutes of idle. Go.\n');
    process.exit(0);
  }

  if (Date.now() - started > BUDGET_MS) {
    process.stdout.write(`\nstill not answering after ${elapsed()}s (last status ${status}).\n`);
    process.stdout.write('Check the Render dashboard; the app will keep waiting on its own.\n');
    process.exit(1);
  }

  process.stdout.write('.');
  await new Promise((r) => setTimeout(r, GAP_MS));
}
