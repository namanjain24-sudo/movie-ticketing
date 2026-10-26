/* ---------------------------------------------------------------------------
   The stands film.

   One canvas, four beats, telling the thing that is genuinely new: the same
   seat-locking mechanic that sells a cinema seat now sells a stand at a
   ground, and the stand is called what the ground calls it.

   Drawn rather than filmed, like the hero film and the sponsor rail. The
   stand names and prices below are the ones actually in the database — the
   Wankhede ladder, top to bottom — because a diagram that invented its own
   numbers would be the one dishonest thing on a page about not doing that.
--------------------------------------------------------------------------- */

(() => {
  const canvas = document.getElementById('standsFilm');
  if (!canvas) return;

  const caption = document.getElementById('standsCaption');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');

  const ACCENT = '#f84464';
  const ACCENT_SOLID = '#d92e50';
  const FREE = '#3f9b58';
  const DIM = 'rgba(255,255,255,0.20)';
  const INK = 'rgba(255,255,255,0.88)';
  const FAINT = 'rgba(255,255,255,0.45)';

  /** The real Wankhede ladder, as seeded. */
  const STANDS = [
    { name: 'Garware Pavilion', price: '₹8,500', rows: 2 },
    { name: 'MCA Pavilion', price: '₹4,500', rows: 2 },
    { name: 'Sachin Tendulkar Stand', price: '₹3,500', rows: 2 },
    { name: 'Sunil Gavaskar Stand', price: '₹2,800', rows: 2 },
    { name: 'Vijay Merchant Stand', price: '₹2,000', rows: 2 },
    { name: 'North Stand', price: '₹1,200', rows: 3 },
  ];

  const CHAPTERS = [
    { at: 0.0, text: 'A ground, not an auditorium. Six stands, six prices.' },
    { at: 0.3, text: 'Each stand is named what the ground names it.' },
    { at: 0.58, text: 'Pick a seat in the Garware Pavilion.' },
    { at: 0.78, text: 'Held by the same row lock that holds a cinema seat.' },
  ];

  let dims = { w: 0, h: 0 };

  /**
   * Draws `text` left-aligned, trimmed with an ellipsis to fit `maxWidth`.
   *
   * `fillText`'s own `maxWidth` condenses the glyphs instead of cutting them,
   * which at 390px turned "Sachin Tendulkar Stand" into something squashed
   * and still touching its price. Cutting is honest and legible; squashing is
   * neither.
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

    const padX = Math.max(16, w * 0.06);
    const labelW = Math.min(196, Math.max(132, w * 0.46));
    const gridX = padX + labelW + 14;
    const gridW = w - gridX - padX;

    // The pitch, at the top, so the geometry reads as a ground.
    const pitchY = 26;
    ctx.strokeStyle = 'rgba(53,214,232,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(w / 2, pitchY, Math.min(150, w * 0.3), 13, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = FAINT;
    ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PITCH', w / 2, pitchY + 16);

    const top = pitchY + 30;
    const seatSize = 9;
    const seatGap = 3;
    const rowH = seatSize + seatGap;
    const bandGap = 9;

    // The chosen seat: second row of the top stand, fourth along.
    const PICK = { band: 0, row: 1, col: 3 };

    let y = top;
    STANDS.forEach((stand, bandIndex) => {
      // Bands arrive one after another over the first beat.
      const arrive = Math.max(0, Math.min(1, (t * 3.4 - bandIndex * 0.42) / 0.6));
      if (arrive <= 0) {
        y += stand.rows * rowH + bandGap;
        return;
      }

      // The name and the price, fading in just behind the seats.
      const named = Math.max(0, Math.min(1, (t - 0.26 - bandIndex * 0.035) / 0.2));
      ctx.globalAlpha = named;

      // The price claims its width first; the name gets what is left, so the
      // two can never collide however narrow the viewport gets.
      ctx.font = '600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      const priceW = ctx.measureText(stand.price).width;
      ctx.textAlign = 'right';
      ctx.fillStyle = ACCENT;
      ctx.fillText(stand.price, padX + labelW, y + 9);

      ctx.textAlign = 'left';
      ctx.fillStyle = INK;
      ctx.font = '600 10.5px ui-sans-serif, system-ui, sans-serif';
      fitText(stand.name, padX, y + 9, labelW - priceW - 10);
      ctx.globalAlpha = 1;

      const perRow = Math.max(6, Math.floor(gridW / rowH));
      for (let r = 0; r < stand.rows; r += 1) {
        for (let c = 0; c < perRow; c += 1) {
          const sx = gridX + c * rowH;
          const sy = y + r * rowH;
          if (sx + seatSize > w - padX) continue;

          const isPick = bandIndex === PICK.band && r === PICK.row && c === PICK.col;

          // The chosen seat turns at beat three, and locks at beat four.
          const picked = isPick && t > 0.6;
          const locked = isPick && t > 0.8;

          ctx.globalAlpha = arrive;
          if (picked) {
            ctx.fillStyle = locked ? ACCENT_SOLID : ACCENT;
            ctx.strokeStyle = ACCENT;
            ctx.fillRect(sx, sy, seatSize, seatSize);
          } else {
            ctx.strokeStyle = FREE;
            ctx.globalAlpha = arrive * 0.75;
          }
          ctx.lineWidth = 1;
          ctx.strokeRect(sx, sy, seatSize, seatSize);
          ctx.globalAlpha = 1;

          // A ring pulsing out of the seat the instant it is locked.
          if (locked && t < 0.94) {
            const p = (t - 0.8) / 0.14;
            ctx.globalAlpha = (1 - p) * 0.8;
            ctx.strokeStyle = ACCENT;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(sx + seatSize / 2, sy + seatSize / 2, 5 + p * 16, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      y += stand.rows * rowH + bandGap;
    });

    // The ticket line, once it is locked.
    if (t > 0.84) {
      ctx.globalAlpha = Math.min(1, (t - 0.84) / 0.1);
      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText('Garware Pavilion · GP-B-4', w / 2, h - 10);
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

  const DURATION = 7000;
  const HOLD = 1400;
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

  // Only while on screen: a canvas running behind six screens of scroll is a
  // laptop fan for nothing.
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
