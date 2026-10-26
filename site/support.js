/* ---------------------------------------------------------------------------
   The support agent film.

   Four beats on one canvas, telling the only thing about an in-app chatbot
   that is actually worth claiming: it is not answering from what a model
   remembers about ticketing apps in general. The server reads this account's
   own booking and this deployment's own policy numbers a second before the
   question is asked, and the model is given those and told to answer from
   nothing else.

   The second half of the story is where the key is. It is on the server. The
   phone never holds it, because anything EXPO_PUBLIC_ is inlined into the
   bundle in plain text and would ship inside the APK.

   Drawn, not filmed, like the hero film, the stands film and the house ads.
   The booking reference and the amounts below are the ones a real booking on
   the live deployment produced.
--------------------------------------------------------------------------- */

(() => {
  const canvas = document.getElementById('supportFilm');
  if (!canvas) return;

  const caption = document.getElementById('supportCaption');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');

  const ACCENT = '#f84464';
  const ACCENT_SOLID = '#d92e50';
  const CYAN = 'rgba(53,214,232,0.75)';
  const INK = 'rgba(255,255,255,0.88)';
  const FAINT = 'rgba(255,255,255,0.42)';
  const LINE = 'rgba(255,255,255,0.14)';

  const QUESTION = 'Can I still cancel my 9pm show?';
  const ANSWER = 'Yes — until 7:30 pm. The ₹30 fee is not refunded.';

  /** What the server puts in front of the model, and nothing else. */
  const CONTEXT = [
    { label: 'BK-46QDDX · 9:00 pm · H7, H8', kind: 'booking' },
    { label: 'Cancel window · 120 min', kind: 'policy' },
    { label: 'Fee ₹30 · never refunded', kind: 'policy' },
  ];

  const CHAPTERS = [
    { at: 0.0, text: 'A question, typed in the app.' },
    { at: 0.26, text: 'The server reads this account’s own booking first.' },
    { at: 0.52, text: 'The model is given that, and told to use nothing else.' },
    { at: 0.76, text: 'So the answer cannot invent a deadline. Or a key.' },
  ];

  let dims = { w: 0, h: 0 };

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  /** Smoothstep, so every arrival eases instead of snapping. */
  const ease = (v) => {
    const p = clamp01(v);
    return p * p * (3 - 2 * p);
  };

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * Draws `text` trimmed with a real ellipsis to fit `maxWidth`.
   *
   * `fillText`'s own `maxWidth` condenses the glyphs rather than cutting
   * them, which looks like a rendering fault rather than a decision.
   */
  function fitText(text, x, y, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y);
      return;
    }
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    ctx.fillText(`${cut}…`, x, y);
  }

  /** `fitText`, for text already centred on `x`. */
  function fitText2(text, x, y, maxWidth) {
    let cut = text;
    while (cut.length > 1 && ctx.measureText(cut).width > maxWidth) cut = cut.slice(0, -1);
    ctx.fillText(cut === text ? text : `${cut}…`, x, y);
  }

  /** A bubble whose text types itself in, left- or right-aligned. */
  function bubble({ x, y, w, text, progress, mine }) {
    const shown = text.slice(0, Math.round(text.length * clamp01(progress)));
    const pad = 11;
    const lineH = 17;

    ctx.font = '500 12px ui-sans-serif, system-ui, sans-serif';

    // Wrapped against the full text, never against the typed-so-far: a bubble
    // that grows a line mid-sentence makes everything under it jump.
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > w - pad * 2 && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);

    const h = lines.length * lineH + pad * 2 - 4;

    ctx.fillStyle = mine ? ACCENT_SOLID : 'rgba(255,255,255,0.045)';
    ctx.strokeStyle = mine ? 'transparent' : LINE;
    ctx.lineWidth = 1;
    roundRect(x, y, w, h, 10);
    ctx.fill();
    if (!mine) ctx.stroke();

    // The typed prefix, re-wrapped onto the same line boxes the full text
    // produced, so characters land where they will finally sit.
    ctx.fillStyle = mine ? '#fff' : INK;
    ctx.textAlign = 'left';
    let used = 0;
    lines.forEach((full, i) => {
      const remaining = shown.length - used;
      if (remaining <= 0) return;
      ctx.fillText(full.slice(0, remaining), x + pad, y + pad + 12 + i * lineH);
      used += full.length + 1;
    });

    return h;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dims = { w: rect.width, h: rect.height };
  }

  function draw(t) {
    const { w, h } = dims;
    ctx.clearRect(0, 0, w, h);

    const padX = Math.max(14, w * 0.05);
    const inner = w - padX * 2;
    const bubbleW = Math.min(250, inner * 0.78);

    // Beat one: the question, typed, pinned right the way the app pins it.
    const qH = bubble({
      x: w - padX - bubbleW,
      y: 16,
      w: bubbleW,
      text: QUESTION,
      progress: t / 0.2,
      mine: true,
    });
    ctx.globalAlpha = 1;

    // Beat two: the server panel, and the context it reads out of its own
    // database. Three chips, arriving one after another.
    const panelY = 16 + qH + 16;
    // Three context lines, then the key chip on a row of its own. Sharing a
    // row with the third line held at 1280px and collided at 320px, where the
    // chip is a third of the panel wide.
    const panelH = 26 + CONTEXT.length * 19 + 26;
    const panelIn = ease((t - 0.24) / 0.14);

    if (panelIn > 0) {
      ctx.globalAlpha = panelIn;
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      roundRect(padX, panelY, inner, panelH, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fill();
      ctx.stroke();

      ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = FAINT;
      ctx.textAlign = 'left';
      ctx.fillText('THIS API · READ A MOMENT AGO', padX + 11, panelY + 16);

      CONTEXT.forEach((item, i) => {
        const chipIn = ease((t - 0.3 - i * 0.055) / 0.1);
        if (chipIn <= 0) return;
        const cy = panelY + 26 + i * 19;
        ctx.globalAlpha = panelIn * chipIn;

        ctx.fillStyle = item.kind === 'booking' ? ACCENT : CYAN;
        ctx.fillRect(padX + 11, cy + 4, 2, 9);

        ctx.font = '500 10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = item.kind === 'booking' ? INK : FAINT;
        fitText(item.label, padX + 19, cy + 12, inner - 30);
      });

      // The key, on this side of the line, with the reason stated. The chip is
      // measured rather than guessed at a fixed width: at 84px the label ran
      // out through the panel's own border, which on a page arguing for
      // precision is the worst possible detail to get wrong.
      const keyIn = ease((t - 0.52) / 0.12);
      if (keyIn > 0) {
        ctx.globalAlpha = panelIn * keyIn;
        ctx.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        const label = 'API KEY · STAYS ON THE SERVER';
        const kw = Math.min(inner - 22, ctx.measureText(label).width + 18);
        const kx = padX + inner - kw - 11;
        const ky = panelY + panelH - 24;
        roundRect(kx, ky, kw, 18, 9);
        ctx.fillStyle = 'rgba(53,214,232,0.10)';
        ctx.strokeStyle = 'rgba(53,214,232,0.35)';
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = CYAN;
        ctx.textAlign = 'center';
        fitText2(label, kx + kw / 2, ky + 12, kw - 12);
      }
      ctx.globalAlpha = 1;
    }

    // Beat three: the context travelling to the model and back. One pulse out,
    // one pulse in, so the direction of the thing is legible.
    const wireY = panelY + panelH + 20;
    const sendIn = ease((t - 0.5) / 0.1);
    if (sendIn > 0) {
      ctx.globalAlpha = sendIn;
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX + 11, wireY);
      ctx.lineTo(w - padX - 11, wireY);
      ctx.stroke();

      ctx.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = FAINT;
      ctx.textAlign = 'right';
      ctx.fillText('GROQ', w - padX - 11, wireY - 6);

      const travel = clamp01((t - 0.54) / 0.16);
      if (travel > 0 && travel < 1) {
        const x = padX + 11 + (inner - 22) * travel;
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.arc(x, wireY, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Beat four: the answer, left-aligned, typed back.
    const answering = (t - 0.74) / 0.2;
    if (answering > 0) {
      bubble({
        x: padX,
        y: wireY + 18,
        w: bubbleW,
        text: ANSWER,
        progress: answering,
        mine: false,
      });
    } else if (sendIn > 0.6) {
      // Three dots while it is still thinking, which is what the app shows.
      const dy = wireY + 28;
      for (let i = 0; i < 3; i += 1) {
        const bob = Math.sin((t * 26 - i * 0.7) * Math.PI) * 0.5 + 0.5;
        ctx.globalAlpha = 0.3 + bob * 0.6;
        ctx.fillStyle = FAINT;
        ctx.beginPath();
        ctx.arc(padX + 12 + i * 10, dy - bob * 2, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // The footer line, once the answer has landed: where every number in it
    // came from.
    if (t > 0.94) {
      ctx.globalAlpha = Math.min(1, (t - 0.94) / 0.05);
      ctx.textAlign = 'center';
      ctx.fillStyle = FAINT;
      ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText('every figure above came from the panel, not the model', w / 2, h - 9);
      ctx.globalAlpha = 1;
    }
  }

  function captionFor(t) {
    let text = CHAPTERS[0].text;
    for (const c of CHAPTERS) if (t >= c.at) text = c.text;
    return text;
  }

  resize();
  window.addEventListener('resize', resize);

  if (reduce) {
    draw(1);
    if (caption) caption.textContent = CHAPTERS[CHAPTERS.length - 1].text;
    return;
  }

  const DURATION = 8200;
  const HOLD = 1600;
  let raf = null;
  let started = 0;
  let shown = '';

  function tick(now) {
    if (!started) started = now;
    const elapsed = (now - started) % (DURATION + HOLD);
    const t = Math.min(1, elapsed / DURATION);
    draw(t);

    const next = captionFor(t);
    if (caption && next !== shown) {
      caption.textContent = next;
      shown = next;
    }

    raf = requestAnimationFrame(tick);
  }

  // Only while on screen. A canvas running behind seven screens of scroll is
  // a laptop fan spinning for nobody.
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
    { threshold: 0.2 },
  );
  io.observe(canvas);
})();
