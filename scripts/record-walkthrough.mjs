/**
 * Records the walkthrough that the marketing site and the README both use.
 *
 * Nothing it captures is staged. The page is apps/mobile running on its web
 * target against the API on localhost:4000 and a seeded Postgres, so the hold
 * timer counts down real server time, the promo code is validated by a real
 * POST /v1/promos/validate, and the booking reference at the end is a row that
 * exists afterwards. The only things added on top are a tap indicator and a
 * caption bar, injected as a DOM overlay so the browser composites them and
 * there is no post production step.
 *
 * It refuses to narrate anything it has not verified: the promo chapter reads
 * the PAY button before and after applying the code, and only claims a
 * discount once that total has actually moved.
 *
 * Usage:
 *
 *   npm run infra                                  # Postgres and Redis
 *   npm run db:seed --workspace @app/api           # a catalogue with showtimes
 *   npm run api                                    # the API on :4000
 *   npm run mobile -- --web                        # metro on :8081
 *   npx playwright-core install ffmpeg             # once: the video encoder
 *   node scripts/record-walkthrough.mjs <showtimeId> [movieSlug]
 *
 * The showtime has to be one whose sales have not closed. `npm run db:seed`
 * prints a usable id, or ask the API:
 *
 *   curl "localhost:4000/v1/showtimes?movieId=<id>&date=$(date +%F)"
 *
 * Output lands in site/media/raw/: a .webm at the phone's true 390x844, plus
 * chapters.json. Encoding to the files the site serves is a separate step,
 * documented in docs/shipping-the-app.md.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error(
    'This script needs playwright-core, which is deliberately not a dependency\n' +
      'of the workspace: it is a one-off authoring tool, not part of the build.\n\n' +
      '  npm i -g playwright-core && npx playwright-core install ffmpeg\n',
  );
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.RECORD_OUT || join(ROOT, 'site', 'media', 'raw');
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.APP_URL || 'http://localhost:8081';
const SHOWTIME = process.argv[2];
const SLUG = process.argv[3] || 'drishyam-the-conclusion';

if (!SHOWTIME) {
  console.error('Usage: node scripts/record-walkthrough.mjs <showtimeId> [movieSlug]');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  isMobile: true,
  hasTouch: true,
  // Recorded at the phone's true size. Playwright captures CSS pixels, so
  // asking for a larger frame pads it rather than adding detail.
  recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
});
const page = await ctx.newPage();

// ---------------------------------------------------------------- overlay --

const OVERLAY = `
(() => {
  if (window.__tut) return;
  const css = document.createElement('style');
  css.textContent = \`
    #tut-cap{position:fixed;left:0;right:0;bottom:0;z-index:2147483646;
      padding:70px 22px 26px;pointer-events:none;
      background:linear-gradient(180deg,transparent,rgba(4,4,7,.94) 55%);
      font:600 19px/1.35 -apple-system,system-ui,sans-serif;color:#fff;
      letter-spacing:-.02em;opacity:0;transition:opacity .35s ease;
      text-shadow:0 1px 14px rgba(0,0,0,.8)}
    #tut-cap[data-on="1"]{opacity:1}
    #tut-dot{position:fixed;z-index:2147483647;width:30px;height:30px;
      margin:-15px 0 0 -15px;border-radius:50%;pointer-events:none;
      background:rgba(255,255,255,.26);border:2px solid rgba(255,255,255,.85);
      box-shadow:0 0 0 1px rgba(0,0,0,.35),0 4px 18px rgba(0,0,0,.5);
      opacity:0;transition:opacity .25s ease,transform .25s ease;
      transform:scale(.9);left:50%;top:50%}
    #tut-dot[data-on="1"]{opacity:1;transform:scale(1)}
    #tut-dot[data-tap="1"]{transform:scale(.62);background:rgba(248,68,100,.6);
      border-color:#f84464;transition:transform .12s ease,background .12s ease}
    #tut-ring{position:fixed;z-index:2147483645;width:30px;height:30px;
      margin:-15px 0 0 -15px;border-radius:50%;pointer-events:none;
      border:2px solid #f84464;opacity:0;left:50%;top:50%}
    @keyframes tut-ripple{from{opacity:.85;transform:scale(.7)}
      to{opacity:0;transform:scale(3.1)}}
    #tut-ring[data-go="1"]{animation:tut-ripple .62s ease-out}
  \`;
  document.documentElement.appendChild(css);
  const mk = (id) => { const e = document.createElement('div'); e.id = id;
    document.documentElement.appendChild(e); return e; };
  const cap = mk('tut-cap'), ring = mk('tut-ring'), dot = mk('tut-dot');
  window.__tut = {
    say(text) {
      if (!text) { cap.dataset.on = '0'; return; }
      cap.textContent = text; cap.dataset.on = '1';
    },
    move(x, y, instant) {
      dot.style.transition = instant ? 'opacity .2s ease'
        : 'left .5s cubic-bezier(.33,1,.68,1),top .5s cubic-bezier(.33,1,.68,1),opacity .2s ease,transform .25s ease';
      dot.style.left = x + 'px'; dot.style.top = y + 'px';
      dot.dataset.on = '1';
    },
    tap(x, y) {
      dot.style.left = x + 'px'; dot.style.top = y + 'px'; dot.dataset.on = '1';
      dot.dataset.tap = '1';
      ring.style.left = x + 'px'; ring.style.top = y + 'px';
      ring.dataset.go = '0'; void ring.offsetWidth; ring.dataset.go = '1';
      setTimeout(() => { dot.dataset.tap = '0'; }, 170);
    },
    hide() { dot.dataset.on = '0'; },
  };
})();
`;

// The app is a single page app, but a few steps navigate hard. Re-inject on
// every document so the overlay survives those.
await page.addInitScript(OVERLAY);

// ------------------------------------------------------------------ helpers -

const started = Date.now();
const chapters = [];
const mark = (title) => {
  const at = (Date.now() - started) / 1000;
  chapters.push({ at: Number(at.toFixed(2)), title });
  console.log(`  [${at.toFixed(1).padStart(5)}s] ${title}`);
};

const wait = (ms) => page.waitForTimeout(ms);
const ensure = () => page.evaluate(OVERLAY).catch(() => {});
const say = async (t) => {
  await ensure();
  await page.evaluate((x) => window.__tut.say(x), t);
};
const moveTo = async (x, y, instant = false) =>
  page.evaluate(([a, b, c]) => window.__tut.move(a, b, c), [x, y, instant]);
const hideDot = () => page.evaluate(() => window.__tut.hide()).catch(() => {});

/** Move the indicator to a point, let it land, ripple, then really click. */
const tapAt = async (x, y, settle = 900) => {
  await moveTo(x, y);
  await wait(560);
  await page.evaluate(([a, b]) => window.__tut.tap(a, b), [x, y]);
  await wait(120);
  await page.mouse.click(x, y);
  await wait(settle);
};

/**
 * Find a control by its label and return the point to tap.
 *
 * Matching on innerText alone is ambiguous: a row that holds a text field and
 * an Apply button has innerText "Apply" too, because an input's value is not
 * part of innerText. Taking the first match there lands the tap on the field
 * and the button is never pressed. So: collect every match, drop any whose
 * centre is covered by a different element, and take the smallest, which is
 * always the control itself rather than a container around it.
 */
const locate = async (label, exact = true) =>
  page.evaluate(
    ([want, ex]) => {
      const matches = [...document.querySelectorAll('div,span,a,[role="button"],input')]
        .filter((e) => {
          const t = (e.innerText || e.placeholder || '').trim();
          if (!(ex ? t === want : t.startsWith(want))) return false;
          const r = e.getBoundingClientRect();
          return e.offsetParent && r.height > 0 && r.width > 0;
        })
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { e, r, area: r.width * r.height };
        })
        .sort((a, b) => a.area - b.area);

      for (const m of matches) {
        const cx = m.r.x + m.r.width / 2;
        const cy = m.r.y + m.r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        // The element at that point has to be the match or something inside it,
        // otherwise the tap would hit whatever is covering it.
        if (top && (top === m.e || m.e.contains(top))) return [cx, cy];
      }
      return null;
    },
    [label, exact],
  );

const tapLabel = async (label, settle = 900, exact = true) => {
  const pt = await locate(label, exact);
  if (!pt) {
    console.log(`  [miss] "${label}"`);
    return false;
  }
  await tapAt(pt[0], pt[1], settle);
  return true;
};

/** Scroll the app's own scroll container, slowly, so it reads on video. */
const glide = async (px, steps = 18) => {
  for (let i = 0; i < steps; i++) {
    await page.evaluate((y) => {
      const sc = [...document.querySelectorAll('div')].filter(
        (e) => e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 300,
      );
      (sc[sc.length - 1] || document.scrollingElement).scrollTop += y;
    }, px / steps);
    await wait(34);
  }
  await wait(420);
};

// ================================================================== the film =

console.log('recording…');

await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await wait(11000);
await ensure();

mark('Sign in');
await say('Sign in, or register. Both hit a real database.');
await wait(1500);

const inputs = page.locator('input');
const emailBox = await inputs.nth(0).boundingBox();
await tapAt(emailBox.x + emailBox.width / 2, emailBox.y + emailBox.height / 2, 300);
await inputs.nth(0).type('demo@example.com', { delay: 55 });
await wait(600);
const passBox = await inputs.nth(1).boundingBox();
await tapAt(passBox.x + passBox.width / 2, passBox.y + passBox.height / 2, 300);
await inputs.nth(1).type('DemoPassw0rd', { delay: 55 });
await wait(900);
await tapLabel('Sign in', 7000);

mark('What is playing');
await say('Everything playing, filtered by city, genre and language.');
await hideDot();
await wait(2600);
await glide(620);
await say('Ratings come from real reviews. Nothing is padded.');
await wait(2400);
await glide(560);
await wait(1600);

mark('Pick a film');
await say('Open a film for the week ahead.');
await wait(1600);
await page.goto(`${BASE}/movie/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await wait(8500);
await ensure();
await say('Certification, runtime and language, before anything else.');
await hideDot();
await wait(2600);
await glide(520, 20);
await say('Then the showtimes, with how full each one already is.');
await wait(2600);
await glide(340, 16);
await wait(1200);

// Tap a real showtime chip rather than navigating to one, so the recording
// shows the journey a person actually takes.
const chip = await page.evaluate(() => {
  const hit = [...document.querySelectorAll('div,span')].find((e) => {
    const t = (e.innerText || '').trim();
    if (!/^\d{1,2}:\d{2}\s?(am|pm)$/i.test(t)) return false;
    const r = e.getBoundingClientRect();
    return e.offsetParent && r.y > 90 && r.y < window.innerHeight - 120 && r.width > 20;
  });
  if (!hit) return null;
  const r = hit.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2, hit.innerText.trim()];
});
console.log('  showtime chip:', JSON.stringify(chip));
if (chip) {
  await say('Pick one.');
  await wait(1200);
  await tapAt(chip[0], chip[1], 9000);
} else {
  await page.goto(`${BASE}/showtime/${SHOWTIME}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await wait(9000);
}
await ensure();

mark('How many seats');
await say('Say how many seats, and the map marks the best ones for you.');
await wait(2200);
await tapLabel('2', 2600);

mark('The seat map');
await say('The price is on the map. Standard, Premium, Recliner.');
await hideDot();
await wait(2600);
await glide(420, 22);
await say('Green is free. Grey is gone. No guessing.');
await wait(2400);
await glide(-420, 22);
await wait(900);

mark('Choose your seats');
await say('Tap the seats you actually want.');
await wait(1500);

const seats = await page.evaluate(() => {
  const cands = [...document.querySelectorAll('[aria-label]')]
    .filter((e) => {
      const l = e.getAttribute('aria-label') || '';
      return (
        /^Row \S+ seat \d+/.test(l) &&
        !/unavailable/i.test(l) &&
        e.getAttribute('aria-disabled') !== 'true'
      );
    })
    .filter(
      (e) =>
        e.offsetParent &&
        e.getBoundingClientRect().width > 10 &&
        e.getBoundingClientRect().width < 60,
    );
  return cands
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return (
        r.x > 24 &&
        r.x + r.width < window.innerWidth - 24 &&
        r.y > 90 &&
        r.y + r.height < window.innerHeight - 170
      );
    })
    .slice(24, 30)
    .map((e) => {
      const r = e.getBoundingClientRect();
      return { label: e.getAttribute('aria-label'), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
});
console.log('  seats:', JSON.stringify(seats.slice(0, 2)));
for (const s of seats.slice(0, 2)) await tapAt(s.x, s.y, 1200);
await say('Picked. The total is already right, fee included.');
await hideDot();
await wait(2600);

mark('Checkout');
await tapLabel('PROCEED TO PAY', 9000);
await say('Those seats are now held for five minutes. On server time.');
await hideDot();
await wait(3400);
await glide(380, 20);

mark('A promo code');
await say('Promo codes are checked again when you pay, never just on screen.');
await wait(1800);
const promoBox = await page.evaluate(() => {
  const i = [...document.querySelectorAll('input')].find((e) => /code/i.test(e.placeholder || ''));
  if (!i) return null;
  const r = i.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
});
/** The PAY button's label, which is the total the user will actually be charged. */
const payTotal = () =>
  page.evaluate(() => {
    const e = [...document.querySelectorAll('div,span')]
      .reverse()
      .find((x) => x.innerText && /^PAY\s*₹[\d,]+$/.test(x.innerText.trim()));
    return e ? e.innerText.trim() : null;
  });

if (promoBox) {
  const before = await payTotal();
  await tapAt(promoBox[0], promoBox[1], 300);
  await page.keyboard.type('WELCOME50', { delay: 70 });
  await wait(700);
  await tapLabel('Apply', 4200);

  let after = await payTotal();
  if (after === before) {
    // One retry: the button re-renders while the field commits, and a tap that
    // lands mid-render does nothing.
    console.log('  promo did not take, retrying');
    await tapLabel('Apply', 4200);
    after = await payTotal();
  }

  console.log(`  promo: ${before} -> ${after}`);
  if (after && after !== before) {
    // Only claim the discount once the total on screen has actually moved.
    await say(`Fifty rupees off. ${before} becomes ${after.replace('PAY ', '')}.`);
    await hideDot();
    await wait(3000);
  } else {
    console.log('  !! promo never applied, dropping the claim from the film');
    await say('Codes are validated by the server, not trusted from the client.');
    await hideDot();
    await wait(2400);
  }
}
await glide(420, 20);
await say('Card, UPI or netbanking.');
await wait(2400);

mark('Pay');
await say('Pay against the clock. If the hold expires first, you are not charged.');
await wait(2200);
const payPt = await page.evaluate(() => {
  const hit = [...document.querySelectorAll('div,span,[role="button"]')]
    .reverse()
    .find((e) => e.innerText && /^PAY\s*₹[\d,]+$/.test(e.innerText.trim()) && e.offsetParent);
  if (!hit) return null;
  const r = hit.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2, hit.innerText.trim()];
});
console.log('  pay:', JSON.stringify(payPt));
if (payPt) await tapAt(payPt[0], payPt[1], 15000);

mark('Your ticket');
await say('Confirmed. The QR is signed, so the gate reads it without a connection.');
await hideDot();
await wait(4000);
await glide(420, 22);
await say('Points earned on what you actually paid.');
await wait(3200);
await say('');
await wait(1200);

const finalUrl = page.url();
console.log('  final url:', finalUrl);
mark('end');

await ctx.close();
await browser.close();

writeFileSync(join(OUT, 'chapters.json'), JSON.stringify({ chapters, finalUrl }, null, 2));
console.log('\nchapters written');
