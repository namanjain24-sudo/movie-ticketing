/**
 * Renders the link preview card the site had no image for.
 *
 * `twitter:card` was already set to `summary_large_image` — a promise of a
 * large picture — and there was no `og:image` to keep it. Every share of this
 * link, and the whole point of the page is a link somebody shares, arrived as
 * a bare title.
 *
 * Drawn here rather than cropped from a screenshot because the slot is
 * 1200x630 and every screenshot in this repo is a phone: 1.91:1 against 0.46:1
 * is not a crop, it is a different picture. The card is built from the site's
 * own tokens and its own font, so it looks like the page it opens.
 *
 * Run: node scripts/render-og-image.mjs
 * Out: site/media/og.png
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error(
    'This script needs playwright-core, which is deliberately not a dependency\n' +
      'of the workspace — nothing the app ships uses it:\n\n' +
      '  npm i -g playwright-core && npx playwright-core install chromium\n',
  );
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');

/** Inlined as a data URI: the page is loaded from a string, with no server. */
const font = readFileSync(join(site, 'fonts', 'geist-variable.woff2')).toString('base64');

const html = `<!doctype html>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: 'Geist';
    src: url(data:font/woff2;base64,${font}) format('woff2');
    font-weight: 100 900;
  }
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 72px 80px;
    background:
      radial-gradient(900px 500px at 78% 12%, rgba(248, 68, 100, 0.16), transparent 68%),
      #0a0a0e;
    color: #f3f3f6;
    font-family: 'Geist', system-ui, sans-serif;
    font-feature-settings: 'ss01';
    -webkit-font-smoothing: antialiased;
  }
  .brand { display: flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 640; letter-spacing: -0.03em; }
  .mark {
    width: 46px; height: 46px; border-radius: 13px; background: #f84464;
    display: flex; align-items: center; justify-content: center;
    font-size: 27px; font-weight: 700; color: #fff;
  }
  h1 { font-size: 86px; line-height: 1.02; letter-spacing: -0.045em; font-weight: 680; max-width: 15ch; }
  h1 em { font-style: normal; color: #f84464; }
  .stats { display: flex; gap: 56px; align-items: flex-end; }
  .stat .n { font-size: 46px; font-weight: 660; letter-spacing: -0.03em; }
  .stat .l { margin-top: 6px; font-size: 19px; color: #a4a4b0; letter-spacing: 0.01em; }
  .rule { height: 1px; background: rgba(255,255,255,0.09); margin-bottom: 30px; }
</style>
<div class="brand"><span class="mark">B</span>Boxoffice</div>
<h1>A seat that <em>cannot</em> be sold twice.</h1>
<div>
  <div class="rule"></div>
  <div class="stats">
    <div class="stat"><div class="n">0</div><div class="l">oversells</div></div>
    <div class="stat"><div class="n">0</div><div class="l">double charges</div></div>
    <div class="stat"><div class="n">5,000</div><div class="l">booking at once</div></div>
    <div class="stat"><div class="n">10</div><div class="l">load tests</div></div>
  </div>
</div>`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const out = join(site, 'media', 'og.png');
writeFileSync(out, await page.screenshot({ type: 'png' }));
await browser.close();
console.log('wrote', out);
