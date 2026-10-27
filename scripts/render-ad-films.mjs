/**
 * Renders the sponsor films the app plays, as real MP4s.
 *
 * The four house ads are drawn frame by frame by `scripts/ad-films/scenes.js`,
 * captured with a headless Chrome and encoded with ffmpeg. Deterministic
 * throughout: the scene file is a pure function of progress, this script asks
 * for frame i of N, and running it twice produces the same video. That is
 * what makes the output something worth committing rather than a binary
 * nobody can reproduce.
 *
 * Why video at all, when the marketing site draws the same ideas on a live
 * canvas: the app is React Native, and a canvas is not a thing it has. The
 * alternatives were a WebView per ad — a browser engine, a second renderer,
 * and no autoplay story worth the trouble — or redrawing each film by hand in
 * Reanimated and maintaining two of everything. An MP4 is 100-odd KB, plays
 * through the same `expo-video` surface for all four, and is the same picture
 * on every device.
 *
 * Usage:
 *
 *   npm i -g playwright-core && npx playwright-core install chromium
 *   brew install ffmpeg
 *   node scripts/render-ad-films.mjs            # all four
 *   node scripts/render-ad-films.mjs archforge  # just one
 *
 * Output lands in apps/mobile/assets/ads/, which the app bundles.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

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

const here = dirname(fileURLToPath(import.meta.url));
const page = join(here, 'ad-films', 'frame.html');
const outDir = join(here, '..', 'apps', 'mobile', 'assets', 'ads');

/**
 * 16:9 at 960x540: sharp on a phone card at 3x without being a download.
 *
 * Both numbers are even because yuv420p subsamples chroma by two, and an odd
 * height makes libx264 refuse the encode outright — 720x405 is the obvious
 * 16:9 and the one that cannot be written.
 */
const WIDTH = 960;
const HEIGHT = 540;
const FPS = 30;
const SECONDS = 11;
/** The last beat holds, so the closing line is readable rather than glimpsed. */
const HOLD_SECONDS = 1.2;

const FILMS = ['archforge', 'hindsight', 'clipstudio', 'marque'];

const only = process.argv[2];
const films = only ? FILMS.filter((f) => f === only) : FILMS;
if (films.length === 0) {
  console.error(`No such film: ${only}. One of: ${FILMS.join(', ')}`);
  process.exit(1);
}

function ffmpeg(args) {
  try {
    execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    const stderr = err.stderr?.toString() ?? '';
    throw new Error(`ffmpeg failed:\n${stderr.split('\n').slice(-12).join('\n')}`);
  }
}

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  // A software rasteriser, deliberately: a GPU path renders slightly
  // differently from machine to machine, and the point of this script is that
  // it does not.
  args: ['--disable-gpu', '--force-color-profile=srgb'],
});

const frames = FPS * SECONDS;
const holdFrames = Math.round(FPS * HOLD_SECONDS);

for (const film of films) {
  const tab = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const url = new URL(pathToFileURL(page));
  url.searchParams.set('film', film);
  url.searchParams.set('w', String(WIDTH));
  url.searchParams.set('h', String(HEIGHT));
  await tab.goto(url.href, { waitUntil: 'load' });

  const dir = mkdtempSync(join(tmpdir(), `ad-${film}-`));
  process.stdout.write(`${film}: `);

  for (let i = 0; i < frames + holdFrames; i += 1) {
    // Past `frames` the film is finished and simply holds its last frame,
    // which is cheaper than drawing it again and identical on screen.
    const t = Math.min(1, i / (frames - 1));
    await tab.evaluate((progress) => window.drawAt(progress), t);
    await tab.screenshot({
      path: join(dir, `${String(i).padStart(4, '0')}.png`),
      animations: 'disabled',
    });
    if (i % 30 === 0) process.stdout.write('.');
  }

  await tab.close();

  const out = join(outDir, `${film}.mp4`);
  ffmpeg([
    '-y',
    '-framerate',
    String(FPS),
    '-i',
    join(dir, '%04d.png'),
    // yuv420p and the even dimensions above: anything else and a share of
    // Android decoders show a green frame or refuse the file outright.
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-profile:v',
    'baseline',
    '-level',
    '3.1',
    '-crf',
    '28',
    '-preset',
    'veryslow',
    // One keyframe a second, so a loop restarts cleanly rather than smearing.
    '-g',
    String(FPS),
    // No audio track at all. These autoplay in a list; a silent track would
    // still take an audio focus request on Android and duck whatever the
    // person was listening to.
    '-an',
    '-movflags',
    '+faststart',
    out,
  ]);

  rmSync(dir, { recursive: true, force: true });
  const kb = Math.round(statSync(out).size / 1024);
  console.log(` ${kb} KB`);
}

await browser.close();
