/* ---------------------------------------------------------------------------
   The sponsor rail.

   Four slots, each a short motion-graphic that tells one project's story in
   three beats, drawn on a canvas rather than shipped as video — the same
   approach the hero film takes, and for the same reasons: it is a few
   kilobytes instead of a few megabytes, it is crisp at any density, and it
   can be read by a screen reader because the copy is real DOM beside it.

   These are the author's own projects and the rail says so. An ad rail that
   implied somebody had paid for the placement would be a lie told for
   decoration, and this page's whole argument is that it does not do that.
--------------------------------------------------------------------------- */

(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rail = document.getElementById('adRail');
  if (!rail) return;

  const ACCENT = '#f84464';
  const DIM = 'rgba(255,255,255,0.22)';
  const INK = 'rgba(255,255,255,0.86)';

  /* --- the four scenes ----------------------------------------------------
     Each takes a 2D context, a 0..1 progress, and the canvas size. They draw
     the idea, not the UI: a screenshot at this size is unreadable, and a
     diagram of what the thing does is not.
  ------------------------------------------------------------------------ */

  /** ArchForge: a sentence becomes a wired architecture. */
  function archforge(ctx, t, w, h) {
    const cx = w / 2;

    // The prompt, typing in.
    ctx.font = '500 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = DIM;
    const prompt = '"a ride-sharing platform like Uber"';
    const typed = prompt.slice(0, Math.floor(Math.min(1, t * 2.4) * prompt.length));
    ctx.textAlign = 'center';
    ctx.fillText(typed, cx, 22);

    // Boxes appear in a graph, then the arrows wire them up.
    const nodes = [
      [cx - 62, 52],
      [cx, 52],
      [cx + 62, 52],
      [cx - 31, 86],
      [cx + 31, 86],
      [cx, 118],
    ];
    const appear = Math.max(0, (t - 0.25) / 0.45);

    ctx.strokeStyle = ACCENT;
    ctx.globalAlpha = Math.max(0, (t - 0.55) / 0.3) * 0.7;
    ctx.lineWidth = 1;
    const edges = [
      [0, 3],
      [1, 3],
      [1, 4],
      [2, 4],
      [3, 5],
      [4, 5],
    ];
    for (const [a, b] of edges) {
      ctx.beginPath();
      ctx.moveTo(nodes[a][0], nodes[a][1] + 7);
      ctx.lineTo(nodes[b][0], nodes[b][1] - 7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    nodes.forEach(([x, y], i) => {
      const on = appear * nodes.length - i;
      if (on <= 0) return;
      const s = Math.min(1, on);
      ctx.globalAlpha = s;
      ctx.strokeStyle = i === 5 ? ACCENT : DIM;
      ctx.lineWidth = 1.2;
      const bw = 44 * s;
      ctx.strokeRect(x - bw / 2, y - 7, bw, 14);
      ctx.globalAlpha = 1;
    });

    // The verdict.
    if (t > 0.82) {
      ctx.globalAlpha = Math.min(1, (t - 0.82) / 0.14);
      ctx.fillStyle = INK;
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('18 components · capacity math · scored', cx, h - 10);
      ctx.globalAlpha = 1;
    }
  }

  /** Hindsight: a call is sealed, the outcome lands, the call is graded. */
  function hindsight(ctx, t, w, h) {
    const cx = w / 2;
    const baseline = h - 34;

    ctx.textAlign = 'center';
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';

    // Beat one: the sealed call.
    const sealed = Math.min(1, t / 0.3);
    ctx.globalAlpha = sealed;
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx - 54, 26, 108, 26);
    ctx.fillStyle = DIM;
    ctx.fillText('sealed', cx, 43);
    ctx.globalAlpha = 1;

    // Beat two: the market does what it does.
    const drawn = Math.max(0, Math.min(1, (t - 0.28) / 0.44));
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const pts = 40;
    for (let i = 0; i <= pts * drawn; i += 1) {
      const p = i / pts;
      const x = cx - 60 + p * 120;
      // A deterministic wiggle, so the same line is drawn every loop.
      const y = baseline - p * 26 - Math.sin(p * 9) * 7;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Beat three: the grade.
    if (t > 0.76) {
      ctx.globalAlpha = Math.min(1, (t - 0.76) / 0.16);
      ctx.fillStyle = INK;
      ctx.fillText('graded against what happened', cx, h - 10);
      ctx.globalAlpha = 1;
    }
  }

  /** ClipStudio: clips land on tracks, a playhead sweeps, it exports. */
  function clipstudio(ctx, t, w, h) {
    const left = 18;
    const right = w - 18;
    const span = right - left;
    const tracks = [36, 62, 88];

    const clips = [
      [0, 0.0, 0.34],
      [0, 0.38, 0.72],
      [1, 0.12, 0.56],
      [2, 0.46, 0.94],
    ];

    clips.forEach(([row, a, b], i) => {
      const on = Math.max(0, Math.min(1, (t - i * 0.07) / 0.3));
      if (on <= 0) return;
      ctx.globalAlpha = on;
      ctx.fillStyle = i === 2 ? 'rgba(248,68,100,0.28)' : 'rgba(255,255,255,0.12)';
      ctx.strokeStyle = i === 2 ? ACCENT : DIM;
      ctx.lineWidth = 1;
      const x = left + a * span;
      const bw = (b - a) * span * on;
      ctx.fillRect(x, tracks[row], bw, 16);
      ctx.strokeRect(x, tracks[row], bw, 16);
      ctx.globalAlpha = 1;
    });

    // The playhead sweeps once the clips are down.
    const sweep = Math.max(0, (t - 0.42) / 0.42);
    if (sweep > 0) {
      const x = left + Math.min(1, sweep) * span;
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, 28);
      ctx.lineTo(x, 110);
      ctx.stroke();
    }

    if (t > 0.86) {
      ctx.globalAlpha = Math.min(1, (t - 0.86) / 0.12);
      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('exported to MP4, in the tab', w / 2, h - 10);
      ctx.globalAlpha = 1;
    }
  }

  /** Marque.ai: a goal falls through the layers and comes out a campaign. */
  function marque(ctx, t, w, h) {
    const cx = w / 2;
    const layers = ['client', 'edge', 'API', 'engines', 'store'];
    const top = 30;
    const gap = 19;

    layers.forEach((label, i) => {
      const on = Math.max(0, Math.min(1, (t - i * 0.1) / 0.28));
      if (on <= 0) return;
      const y = top + i * gap;
      ctx.globalAlpha = on * 0.9;
      ctx.strokeStyle = DIM;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 62, y);
      ctx.lineTo(cx + 62, y);
      ctx.stroke();
      ctx.fillStyle = DIM;
      ctx.font = '500 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, cx - 60, y - 4);
      ctx.globalAlpha = 1;
    });

    // The request, falling down the spine.
    const fall = Math.max(0, Math.min(1, (t - 0.18) / 0.56));
    if (fall > 0) {
      const y = top + fall * (layers.length - 1) * gap;
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(cx + 52, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (t > 0.8) {
      ctx.globalAlpha = Math.min(1, (t - 0.8) / 0.16);
      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('goal in, campaign out', cx, h - 10);
      ctx.globalAlpha = 1;
    }
  }

  const SLOTS = [...rail.querySelectorAll('[data-ad]')];
  const SCENES = { archforge, hindsight, clipstudio, marque };

  for (const slot of SLOTS) {
    const canvas = slot.querySelector('canvas');
    const scene = SCENES[slot.dataset.ad];
    if (!canvas || !scene) continue;

    const ctx = canvas.getContext('2d');
    const size = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: rect.width, h: rect.height };
    };

    let dims = size();
    window.addEventListener('resize', () => {
      dims = size();
    });

    const draw = (t) => {
      ctx.clearRect(0, 0, dims.w, dims.h);
      scene(ctx, t, dims.w, dims.h);
    };

    if (reduce) {
      // The finished frame, which is the one that carries the information.
      draw(1);
      continue;
    }

    // Only animates while on screen. Four always-running canvases on a
    // marketing page is a laptop fan for no reason.
    let raf = null;
    let started = 0;
    const DURATION = 5200;
    const HOLD = 1100;

    const tick = (now) => {
      if (!started) started = now;
      const elapsed = (now - started) % (DURATION + HOLD);
      draw(Math.min(1, elapsed / DURATION));
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && raf === null) {
            started = 0;
            raf = requestAnimationFrame(tick);
          } else if (!entry.isIntersecting && raf !== null) {
            cancelAnimationFrame(raf);
            raf = null;
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(slot);
  }
})();
