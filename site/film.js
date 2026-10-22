/* ---------------------------------------------------------------------------
   "One seat, five thousand hands"

   A six scene motion graphics piece, rendered to canvas on a deterministic
   timeline. It is not decoration: it is the one claim this product makes,
   animated. A house of 300 seats, five thousand people reaching for it at
   once, hundreds of them reaching for the same seat, and exactly one of them
   getting it while the rest are redirected rather than lost.

   Every figure that appears on screen is one the load tests actually produced
   (docs/load-testing.md): 300 seats of inventory, 5,000 virtual users at the
   peak run, zero unexpected responses, zero oversells. The crowd itself is a
   visualisation, drawn at a fraction of that scale so it stays legible.

   Everything is a pure function of `t` in seconds, so scrubbing, pausing and
   chapter jumps all work without any extra state to keep in sync.

   Performance: one rAF loop, one canvas, agents in typed arrays allocated
   once, and the loop stops entirely when the canvas scrolls out of view.
--------------------------------------------------------------------------- */

(() => {
  const stage = document.getElementById('filmStage');
  if (!stage) return;

  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const captionEl = document.getElementById('filmCaption');
  const clockEl = document.getElementById('filmClock');
  const toggleEl = document.getElementById('filmToggle');
  const chapterButtons = [...document.querySelectorAll('.film-chapters button')];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // --- the score ------------------------------------------------------------

  const SCENES = [
    { at: 0.0, line: 'One auditorium. 300 seats, every one of them free.' },
    { at: 3.8, line: 'Booking opens. 5,000 people arrive in the same minute.' },
    { at: 8.8, line: 'Hundreds of them reach for the same seat.' },
    { at: 13.6, line: 'The row is locked. One request wins it.' },
    { at: 18.0, line: 'Everyone else is redirected, not dropped.' },
    { at: 22.4, line: '300 sold. 0 oversold. Every run, every time.' },
  ];
  const DURATION = 27;

  // --- geometry -------------------------------------------------------------
  // 12 x 25, which is the 300 seats the load tests use, in a shallow wide
  // house that suits a 16:10 frame.

  const ROWS = 12;
  const COLS = 25;
  const SEATS = ROWS * COLS;
  const HOT_ROW = 6;
  const HOT_COL = 12;
  const HOT = HOT_ROW * COLS + HOT_COL;
  const HOT_LABEL = `${'ABCDEFGHJKLM'[HOT_ROW]}${HOT_COL + 1}`;

  const seatX = new Float32Array(SEATS);
  const seatY = new Float32Array(SEATS);
  const seatW = new Float32Array(SEATS);
  const seatDelay = new Float32Array(SEATS);
  const seatFill = new Float32Array(SEATS);

  // --- agents ---------------------------------------------------------------

  const AGENTS = 1100;
  const aFromX = new Float32Array(AGENTS);
  const aFromY = new Float32Array(AGENTS);
  const aSeat = new Int16Array(AGENTS);
  const aSeat2 = new Int16Array(AGENTS);
  const aT = new Float32Array(AGENTS);
  const aHot = new Uint8Array(AGENTS);
  const aAngle = new Float32Array(AGENTS);
  const aJit = new Float32Array(AGENTS);

  // Deterministic noise, so the film is identical on every machine and on
  // every replay. Math.random would make scrubbing backwards look wrong.
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 100000) / 100000;
  };

  let W = 0;
  let H = 0;
  let unit = 1;
  let screenTop = 0;

  function layout() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, rect.width);
    H = Math.max(200, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    unit = Math.min(W / 900, H / 560);

    // Top band is the readout, then the screen, then the house, then room at
    // the bottom for the caption. Nothing overlaps anything.
    screenTop = H * 0.2;
    const padX = W * 0.09;
    const padTop = H * 0.37;
    const padBottom = H * 0.2;
    const usableH = H - padTop - padBottom;
    const rowGap = usableH / (ROWS - 1);

    for (let r = 0; r < ROWS; r++) {
      const depth = r / (ROWS - 1);
      const rowWidth = (W - padX * 2) * (0.76 + depth * 0.24);
      const cell = rowWidth / COLS;
      const left = (W - rowWidth) / 2 + cell / 2;
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const off = (c / (COLS - 1)) * 2 - 1;
        seatX[i] = left + c * cell;
        seatY[i] = padTop + r * rowGap + Math.abs(off) * rowGap * 0.3;
        seatW[i] = cell * 0.7;
      }
    }
  }

  function seedContent() {
    seed = 0x9e3779b9;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const off = Math.abs((c / (COLS - 1)) * 2 - 1);
        seatDelay[i] = r * 0.1 + off * 0.32 + rnd() * 0.07;
        seatFill[i] = rnd();
      }
    }
    for (let i = 0; i < AGENTS; i++) {
      const edge = rnd();
      const along = rnd();
      if (edge < 0.34) {
        aFromX[i] = along * W;
        aFromY[i] = -H * (0.15 + rnd() * 0.6);
      } else if (edge < 0.67) {
        aFromX[i] = -W * (0.1 + rnd() * 0.5);
        aFromY[i] = along * H;
      } else {
        aFromX[i] = W + W * (0.1 + rnd() * 0.5);
        aFromY[i] = along * H;
      }
      aSeat[i] = Math.floor(rnd() * SEATS);
      aSeat2[i] = Math.floor(rnd() * SEATS);
      aT[i] = rnd();
      aHot[i] = rnd() < 0.28 ? 1 : 0;
      aAngle[i] = rnd() * Math.PI * 2;
      aJit[i] = rnd() * Math.PI * 2;
    }
  }

  // --- easing ---------------------------------------------------------------

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const outCubic = (p) => 1 - Math.pow(1 - p, 3);
  const inOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const outBack = (p) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
  const lerp = (a, b, p) => a + (b - a) * p;

  // --- palette --------------------------------------------------------------

  const css = getComputedStyle(document.documentElement);
  const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const palette = {
    bg: read('--bg-deep', '#07070a'),
    free: read('--seat-free', '#3f9b58'),
    accent: read('--accent', '#f84464'),
    taken: read('--seat-taken', '#2a2a33'),
    dim: read('--text-faint', '#6e6e7c'),
    text: read('--text', '#f3f3f6'),
  };

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  // --- the screen ------------------------------------------------------------

  function drawScreen(t) {
    const p = outCubic(clamp01(t / 1.2));
    if (p <= 0) return;
    const cx = W / 2;
    const halfW = W * 0.25;
    const bow = 22 * unit;

    ctx.save();

    // The light the screen throws down over the house.
    ctx.globalAlpha = p * 0.5;
    const cone = ctx.createLinearGradient(0, screenTop, 0, H * 0.78);
    cone.addColorStop(0, 'rgba(142,164,214,0.17)');
    cone.addColorStop(1, 'rgba(142,164,214,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, screenTop + 4 * unit);
    ctx.lineTo(cx + halfW, screenTop + 4 * unit);
    ctx.lineTo(cx + halfW * 2.5, H * 0.78);
    ctx.lineTo(cx - halfW * 2.5, H * 0.78);
    ctx.closePath();
    ctx.fill();

    // The screen itself: a shallow bowed strip, brighter at the top edge.
    ctx.globalAlpha = p;
    const face = ctx.createLinearGradient(0, screenTop - 2 * unit, 0, screenTop + bow * 1.5);
    face.addColorStop(0, 'rgba(196,208,236,0.30)');
    face.addColorStop(1, 'rgba(120,136,180,0.05)');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, screenTop);
    ctx.quadraticCurveTo(cx, screenTop + bow * 0.55, cx + halfW, screenTop);
    ctx.lineTo(cx + halfW, screenTop + bow);
    ctx.quadraticCurveTo(cx, screenTop + bow * 1.55, cx - halfW, screenTop + bow);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(206,216,244,0.5)';
    ctx.lineWidth = Math.max(1, 1.4 * unit);
    ctx.setLineDash([halfW * 2.3 * p, 9999]);
    ctx.beginPath();
    ctx.moveTo(cx - halfW, screenTop);
    ctx.quadraticCurveTo(cx, screenTop + bow * 0.55, cx + halfW, screenTop);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // --- the seats -------------------------------------------------------------

  /** 0 free, 1 contested, 2 locked to one buyer, 3 sold. */
  function seatStateAt(i, t) {
    if (i === HOT) {
      if (t >= SCENES[3].at + 1.5) return 2;
      if (t >= SCENES[2].at) return 1;
      return 0;
    }
    const sellAt = SCENES[5].at - 1.4 + seatFill[i] * 3.2;
    return t >= sellAt ? 3 : 0;
  }

  function drawSeats(t) {
    for (let i = 0; i < SEATS; i++) {
      const born = clamp01((t - seatDelay[i]) / 0.45);
      if (born <= 0) continue;
      const w = seatW[i] * outBack(born);
      const r = Math.max(1.5, w * 0.26);
      const x = seatX[i] - w / 2;
      const y = seatY[i] - w / 2;
      const state = seatStateAt(i, t);

      ctx.globalAlpha = born;

      if (state === 3) {
        ctx.fillStyle = palette.taken;
        roundRect(x, y, w, w, r);
        ctx.fill();
      } else if (state === 2) {
        ctx.fillStyle = palette.accent;
        roundRect(x, y, w, w, r);
        ctx.fill();
      } else if (state === 1) {
        const beat = 0.5 + 0.5 * Math.sin(t * 12);
        ctx.globalAlpha = born * (0.25 + beat * 0.45);
        ctx.fillStyle = palette.accent;
        roundRect(x, y, w, w, r);
        ctx.fill();
        ctx.globalAlpha = born;
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = Math.max(1, 1.4 * unit);
        roundRect(x, y, w, w, r);
        ctx.stroke();
      } else {
        ctx.globalAlpha = born * 0.7;
        ctx.strokeStyle = palette.free;
        ctx.lineWidth = Math.max(1, 1.15 * unit);
        roundRect(x, y, w, w, r);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The ring that closes on the winning seat when the row locks. */
  function drawLock(t) {
    const start = SCENES[3].at;
    const p = clamp01((t - start) / 1.5);
    if (p <= 0 || t > SCENES[5].at + 1.5) return;

    const w = seatW[HOT];
    const cx = seatX[HOT];
    const cy = seatY[HOT];

    // Dimming the rest of the row is what a row lock actually looks like.
    const rowStart = HOT_ROW * COLS;
    ctx.save();
    ctx.globalAlpha = Math.min(p, 1) * 0.6 * (1 - clamp01((t - SCENES[4].at) / 1.4));
    ctx.fillStyle = palette.bg;
    const a = seatX[rowStart] - seatW[rowStart];
    const b = seatX[rowStart + COLS - 1] + seatW[rowStart + COLS - 1];
    ctx.fillRect(a, cy - w * 1.7, b - a, w * 3.4);
    ctx.restore();

    const radius = w * (4.2 - 2.6 * outCubic(p));
    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = p < 1 ? 0.3 + p * 0.65 : 1 - clamp01((t - start - 2.8) / 1.2);
    ctx.lineWidth = Math.max(1.3, 2.2 * unit);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * outCubic(p));
    ctx.stroke();
    ctx.restore();
  }

  // --- the crowd -------------------------------------------------------------

  const RUSH = () => SCENES[1].at;
  const CONTEND = () => SCENES[2].at;
  const LOCK = () => SCENES[3].at;
  const REST = () => SCENES[4].at;
  const COUNT = () => SCENES[5].at;

  /** Where agent `i` is at time `t`. Pure, so a trail is just t minus a bit. */
  function agentAt(i, t, out) {
    const p = clamp01((t - RUSH() - aT[i] * 1.6) / 2.4);
    if (p <= 0) return false;

    const hot = aHot[i] === 1;
    // A seat is a destination, not a parking space: everyone settles a little
    // off centre so the crowd reads as a crowd rather than as a second grid.
    const jx = Math.cos(aJit[i] + t * 0.9) * seatW[0] * 0.5;
    const jy = Math.sin(aJit[i] * 1.7 + t * 0.75) * seatW[0] * 0.5;

    let tx;
    let ty;

    if (t < CONTEND()) {
      tx = seatX[aSeat[i]] + jx;
      ty = seatY[aSeat[i]] + jy;
    } else if (t < LOCK()) {
      if (hot) {
        // The funnel: a wide swarm tightening onto one seat.
        const q = inOut(clamp01((t - CONTEND()) / 2.2));
        const ring = lerp(H * 0.36, H * 0.085, q) * (0.6 + (i % 7) / 9);
        tx = lerp(seatX[aSeat[i]], seatX[HOT] + Math.cos(aAngle[i] + t * 0.5) * ring, q);
        ty = lerp(seatY[aSeat[i]], seatY[HOT] + Math.sin(aAngle[i] + t * 0.5) * ring * 0.55, q);
      } else {
        tx = seatX[aSeat[i]] + jx;
        ty = seatY[aSeat[i]] + jy;
      }
    } else if (t < REST()) {
      if (hot) {
        const ring = H * 0.085 * (0.6 + (i % 7) / 9);
        tx = seatX[HOT] + Math.cos(aAngle[i] + t * 0.5) * ring;
        ty = seatY[HOT] + Math.sin(aAngle[i] + t * 0.5) * ring * 0.55;
      } else {
        tx = seatX[aSeat[i]] + jx;
        ty = seatY[aSeat[i]] + jy;
      }
    } else {
      // Redirected rather than dropped: the losers travel to another free
      // seat. Nobody is thrown away, which is the whole point of the beat.
      const q = outCubic(clamp01((t - REST() - (i % 11) * 0.03) / 1.9));
      const target = hot ? aSeat2[i] : aSeat[i];
      const ring = H * 0.085 * (0.6 + (i % 7) / 9);
      const fromX = hot ? seatX[HOT] + Math.cos(aAngle[i] + t * 0.5) * ring : seatX[aSeat[i]];
      const fromY = hot
        ? seatY[HOT] + Math.sin(aAngle[i] + t * 0.5) * ring * 0.55
        : seatY[aSeat[i]];
      tx = lerp(fromX, seatX[target] + jx, q);
      ty = lerp(fromY, seatY[target] + jy, q);
    }

    const e = outCubic(p);
    out[0] = lerp(aFromX[i], tx, e);
    out[1] = lerp(aFromY[i], ty, e);
    return true;
  }

  const pos = [0, 0];
  const prev = [0, 0];

  function drawAgents(t) {
    if (t < RUSH() || t > COUNT() + 1.8) return;
    const fade = 1 - clamp01((t - COUNT() + 0.2) / 1.8);
    const dot = Math.max(1.3, 2.4 * unit);

    ctx.lineCap = 'round';
    for (let i = 0; i < AGENTS; i++) {
      if (!agentAt(i, t, pos)) continue;
      const hot = aHot[i] === 1 && t > CONTEND();
      const hasPrev = agentAt(i, t - 0.038, prev);

      ctx.strokeStyle = hot ? palette.accent : '#93a3ca';
      ctx.fillStyle = hot ? palette.accent : '#93a3ca';
      ctx.globalAlpha = fade * (hot ? 0.95 : 0.55);

      if (hasPrev) {
        // A short trail in the direction of travel: speed without a particle
        // system, and it costs one extra line per agent.
        ctx.lineWidth = dot * 0.85;
        ctx.beginPath();
        ctx.moveTo(prev[0], prev[1]);
        ctx.lineTo(pos[0], pos[1]);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(pos[0], pos[1], dot * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // --- the readout -----------------------------------------------------------
  // Top left, clear of the screen. Only figures the load tests produced.

  function drawReadout(t) {
    const pad = Math.max(14, 22 * unit);
    const big = Math.max(16, 27 * unit);
    const small = Math.max(9, 11 * unit);

    let value;
    let label;

    if (t >= COUNT()) {
      const p = clamp01((t - COUNT()) / 2.4);
      value = `${Math.round(300 * outCubic(p))} / 300`;
      label = 'SOLD / INVENTORY';
    } else if (t >= REST()) {
      value = '0';
      label = 'REQUESTS LOST';
    } else if (t >= LOCK()) {
      value = '1';
      label = `REQUEST WON ${HOT_LABEL}`;
    } else if (t >= CONTEND()) {
      value = HOT_LABEL;
      label = 'ONE SEAT, MANY HANDS';
    } else if (t >= RUSH()) {
      const p = clamp01((t - RUSH()) / 2.8);
      value = Math.round(5000 * outCubic(p)).toLocaleString('en-US');
      label = 'PEOPLE BOOKING AT ONCE';
    } else {
      const p = clamp01(t / 2.2);
      value = String(Math.round(300 * outCubic(p)));
      label = 'SEATS IN THE HOUSE';
    }

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = palette.text;
    ctx.font = `500 ${big}px "Geist Mono", ui-monospace, monospace`;
    ctx.fillText(value, pad, pad + big * 0.84);
    ctx.fillStyle = palette.dim;
    ctx.font = `500 ${small}px "Geist Mono", ui-monospace, monospace`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.14em';
    ctx.fillText(label, pad, pad + big * 0.84 + small * 1.9);
    ctx.restore();

    // The zero that the whole film exists to land on.
    if (t >= COUNT() + 1.5) {
      const p = clamp01((t - COUNT() - 1.5) / 0.8);
      ctx.save();
      ctx.globalAlpha = p;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = palette.accent;
      ctx.font = `500 ${big}px "Geist Mono", ui-monospace, monospace`;
      ctx.fillText('0', W - pad, pad + big * 0.84);
      ctx.fillStyle = palette.dim;
      ctx.font = `500 ${small}px "Geist Mono", ui-monospace, monospace`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0.14em';
      ctx.fillText('OVERSOLD', W - pad, pad + big * 0.84 + small * 1.9);
      ctx.restore();
    }
  }

  function render(t) {
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, W, H);
    drawScreen(t);
    drawSeats(t);
    drawLock(t);
    drawAgents(t);
    drawReadout(t);
  }

  // --- transport ------------------------------------------------------------

  let playhead = 0;
  let playing = false;
  let last = 0;
  let raf = 0;
  let visible = false;
  let currentScene = -1;

  function sceneIndexAt(t) {
    let n = 0;
    for (let i = 0; i < SCENES.length; i++) if (t >= SCENES[i].at) n = i;
    return n;
  }

  function paintChrome(t) {
    const n = sceneIndexAt(t);
    if (n !== currentScene) {
      currentScene = n;
      // The chapter rail already says which scene this is; the caption only
      // has to say what is happening in it.
      captionEl.textContent = SCENES[n].line;
      chapterButtons.forEach((b, i) => b.setAttribute('aria-current', i === n ? 'true' : 'false'));
    }
    for (let i = 0; i < chapterButtons.length; i++) {
      const from = SCENES[i].at;
      const to = i + 1 < SCENES.length ? SCENES[i + 1].at : DURATION;
      chapterButtons[i].style.setProperty('--p', clamp01((t - from) / (to - from)).toFixed(3));
    }
    clockEl.textContent = `${t.toFixed(1).padStart(4, '0')} / ${DURATION.toFixed(1)}`;
  }

  function frame(now) {
    raf = 0;
    if (!playing) return;
    // Clamped so a long tab-away resumes rather than jumping the film.
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    playhead += dt;
    if (playhead >= DURATION) playhead -= DURATION;
    render(playhead);
    paintChrome(playhead);
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (playing || reduceMotion.matches || !visible) return;
    playing = true;
    last = performance.now();
    toggleEl.dataset.playing = 'true';
    toggleEl.setAttribute('aria-label', 'Pause the film');
    raf = requestAnimationFrame(frame);
  }

  function pause() {
    playing = false;
    toggleEl.dataset.playing = 'false';
    toggleEl.setAttribute('aria-label', 'Play the film');
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function seek(t) {
    playhead = Math.max(0, Math.min(t, DURATION - 0.01));
    render(playhead);
    paintChrome(playhead);
  }

  toggleEl.addEventListener('click', () => (playing ? pause() : play()));

  chapterButtons.forEach((b, i) => {
    b.addEventListener('click', () => {
      seek(SCENES[i].at);
      play();
    });
  });

  // Never run the loop for a canvas nobody is looking at.
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible) play();
      else pause();
    },
    { threshold: 0.15 },
  ).observe(stage);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else if (visible) play();
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      layout();
      seedContent();
      render(playhead);
      paintChrome(playhead);
    }, 150);
  });

  function start() {
    layout();
    seedContent();
    if (reduceMotion.matches) {
      // Hold the frame the whole film is built to arrive at.
      pause();
      seek(DURATION - 1.4);
      return;
    }
    seek(0);
    play();
  }

  // The variable font changes the readout's metrics, so wait for it rather
  // than painting once with a fallback and then again without.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
  else start();

  reduceMotion.addEventListener('change', () => {
    pause();
    start();
  });
})();
