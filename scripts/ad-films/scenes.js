/* ---------------------------------------------------------------------------
   The sponsor films, as frames.

   Four motion graphics, one per project the author built, drawn on a canvas
   and rendered deterministically: `renderFrame(canvas, name, t)` draws the
   frame at progress `t` in 0..1 and nothing else. No clock, no
   requestAnimationFrame, no randomness — the capture script can ask for frame
   173 of 330 and get the same picture every time, which is what makes the
   encode reproducible and the committed MP4 something anybody can regenerate.

   Each film is shaped like an ad rather than like a diagram: a title card
   that resolves into the brand's chrome, three beats that show the idea
   working, and an end card with the one line worth remembering. Every one has
   its own palette, because four red films in a row look like one film.

   These are the author's own projects and every frame says so. Every claim in
   them is one the project's own page already makes; a house ad that invented
   a feature would be the single dishonest thing in an app whose whole
   argument is that it does not do that.
--------------------------------------------------------------------------- */

const SANS = 'ui-sans-serif, -apple-system, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const INK = 'rgba(255,255,255,0.94)';
const DIM = 'rgba(255,255,255,0.46)';
const FAINT = 'rgba(255,255,255,0.14)';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Smoothstep. Everything in these films arrives, nothing snaps. */
const ease = (v) => {
  const p = clamp01(v);
  return p * p * (3 - 2 * p);
};

/** Eased, with a little overshoot — for things that should feel sprung. */
function overshoot(v) {
  const p = clamp01(v);
  const c = 1.70158 + 1;
  return 1 + c * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;
}

/** A window of the timeline, remapped to 0..1 and eased. */
const beat = (t, from, span) => ease((t - from) / span);
/** The same window, linear, for things that travel rather than fade. */
const span = (t, from, length) => clamp01((t - from) / length);

/**
 * A beat's own life: 0 before it, 0..1 as it arrives, 1 while it holds, and
 * back to 0 as it leaves. Scenes use it so a beat can clear the stage for the
 * next one instead of every element piling up in the final frame.
 */
function life(t, from, to, fade = 0.06) {
  if (t < from) return 0;
  if (t > to) return 0;
  return Math.min(ease((t - from) / fade), ease((to - t) / fade));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws with a glow, then puts the context back as it found it. */
function glow(ctx, colour, blur, draw) {
  ctx.save();
  ctx.shadowColor = colour;
  ctx.shadowBlur = blur;
  draw();
  ctx.restore();
}

/** Text cut with a real ellipsis rather than condensed by `maxWidth`. */
function fit(ctx, text, x, y, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  ctx.fillText(`${cut}…`, x, y);
}

/**
 * Text revealed by a wipe rather than a fade.
 *
 * A headline that fades in reads as a slide; one uncovered left to right
 * reads as something being said. The clip is the whole point — the glyphs
 * never change opacity, so the weight stays constant while it arrives.
 */
function wipeText(ctx, text, x, y, progress, { align = 'center' } = {}) {
  const p = ease(progress);
  if (p <= 0) return;
  const width = ctx.measureText(text).width;
  const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;

  ctx.save();
  ctx.beginPath();
  ctx.rect(left - 4, y - 44, width * p + 8, 64);
  ctx.clip();
  ctx.textAlign = 'left';
  ctx.fillText(text, left, y);
  ctx.restore();
}

/* --- the stage every film shares ---------------------------------------- */

/**
 * Background: a brand-coloured bloom, a perspective grid that drifts, and a
 * vignette to hold the eye in the middle.
 *
 * Drawn per frame rather than cached because the grid moves; it is cheap, and
 * the encoder sees a continuous gradient rather than a hard-edged one, which
 * is what stops a dark background banding at this bitrate.
 */
function stage(ctx, w, h, palette, t) {
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, w, h);

  // Two blooms, moving slowly in opposite directions.
  const drift = Math.sin(t * Math.PI * 2) * 40;
  const a = ctx.createRadialGradient(w * 0.3 + drift, h * 0.1, 0, w * 0.3, h * 0.1, h * 1.1);
  a.addColorStop(0, palette.bloom);
  a.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, w, h);

  const b = ctx.createRadialGradient(w * 0.8 - drift, h * 0.95, 0, w * 0.8, h * 0.95, h * 0.9);
  b.addColorStop(0, palette.bloom2);
  b.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, w, h);

  // A floor grid in false perspective: lines converging towards the horizon,
  // scrolling towards the viewer. It gives the frame a depth that a flat
  // background never has, and costs almost nothing to draw.
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  const horizon = h * 0.52;
  for (let i = 0; i < 14; i += 1) {
    // Rows bunch towards the horizon, and the scroll offset makes them move.
    const p = ((i + (t * 2 % 1)) / 14) ** 2.2;
    const y = horizon + p * (h - horizon) * 1.25;
    if (y > h) continue;
    ctx.globalAlpha = 0.35 * (1 - p) + 0.05;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let i = -8; i <= 8; i += 1) {
    ctx.globalAlpha = 0.16 - Math.abs(i) * 0.012;
    if (ctx.globalAlpha <= 0) continue;
    ctx.beginPath();
    ctx.moveTo(w / 2 + i * 26, horizon);
    ctx.lineTo(w / 2 + i * 190, h);
    ctx.stroke();
  }
  ctx.restore();

  // Vignette.
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/**
 * The brand mark: a rounded tile with the initial in it, glowing.
 *
 * One drawn mark rather than four imported logos. These are side projects,
 * most of them have no logo, and inventing one for each would be dressing up
 * the ad with something that does not exist.
 */
function mark(ctx, x, y, size, palette, letter, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  glow(ctx, palette.accent, size * 0.6, () => {
    const g = ctx.createLinearGradient(x - size / 2, y - size / 2, x + size / 2, y + size / 2);
    g.addColorStop(0, palette.accent);
    g.addColorStop(1, palette.accent2);
    ctx.fillStyle = g;
    roundRect(ctx, x - size / 2, y - size / 2, size, size, size * 0.28);
    ctx.fill();
  });
  ctx.fillStyle = '#0B0B10';
  ctx.font = `800 ${size * 0.56}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, x, y + size * 0.02);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

/**
 * The title card, and its resolve into the corner.
 *
 * The mark and the name start big and centred, then travel to the top left
 * and shrink into the chrome the rest of the film wears. One continuous
 * movement rather than a cut, so the brand is never re-introduced.
 */
function titleCard(ctx, w, h, palette, film, t) {
  const HOLD = 0.1;
  const MOVE = 0.1;
  const p = span(t, HOLD, MOVE);
  const e = ease(p);

  const bigSize = 76;
  const smallSize = 30;
  const size = bigSize + (smallSize - bigSize) * e;

  const bigX = w / 2;
  const bigY = h * 0.42;
  const smallX = 34 + smallSize / 2;
  const smallY = 34 + smallSize / 2;
  const x = bigX + (smallX - bigX) * e;
  const y = bigY + (smallY - bigY) * e;

  // The mark arrives with a little spring before anything else happens.
  const arrive = overshoot(span(t, 0, 0.07));
  mark(ctx, x, y, size * arrive, palette, film.name[0], Math.min(1, arrive));

  // The name: centred under the mark, ending up beside it.
  const nameSize = 40 + (19 - 40) * e;
  ctx.font = `700 ${nameSize}px ${SANS}`;
  ctx.fillStyle = INK;
  const nameBigY = bigY + bigSize * 0.78 + 26;
  const nameSmallY = smallY + 7;
  const nameY = nameBigY + (nameSmallY - nameBigY) * e;
  const nameX = bigX + (smallX + smallSize / 2 + 12 - bigX) * e;

  if (e < 0.02) {
    // Still the title card: the name is wiped in under the mark.
    ctx.textAlign = 'center';
    wipeText(ctx, film.name, nameX, nameY, span(t, 0.04, 0.06));
  } else {
    ctx.textAlign = e > 0.5 ? 'left' : 'center';
    const drawX = e > 0.5 ? nameX : nameX;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    const width = ctx.measureText(film.name).width;
    ctx.fillText(film.name, e > 0.5 ? drawX : drawX - width / 2, nameY);
    ctx.restore();
  }

  // The kicker, which only exists on the title card and fades out with it.
  const kickerAlpha = Math.min(ease(span(t, 0.05, 0.05)), 1 - e * 1.6);
  if (kickerAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = kickerAlpha;
    ctx.font = `600 12px ${MONO}`;
    ctx.fillStyle = palette.accent;
    ctx.textAlign = 'center';
    ctx.fillText(film.kicker.toUpperCase(), bigX, nameBigY + 28);
    ctx.restore();
  }

  // Once resolved, the kicker reappears small, under the name in the corner.
  if (e > 0.6) {
    ctx.save();
    ctx.globalAlpha = (e - 0.6) / 0.4;
    ctx.font = `600 9.5px ${MONO}`;
    ctx.fillStyle = palette.accent;
    ctx.textAlign = 'left';
    ctx.fillText(film.kicker.toUpperCase(), smallX + smallSize / 2 + 12, smallY + 23);
    ctx.restore();
  }
}

/**
 * The honest label, top right, on every frame after the title card.
 *
 * Not decoration and not fine print: these slots look exactly like paid
 * placements and are not, so the film says whose they are the whole way
 * through rather than once at the end.
 */
function houseLabel(ctx, w, t) {
  const a = ease(span(t, 0.2, 0.06));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a * 0.9;
  ctx.font = `600 10px ${MONO}`;
  ctx.fillStyle = DIM;
  ctx.textAlign = 'right';
  ctx.fillText('HOUSE AD · BUILT BY THIS APP’S AUTHOR', w - 34, 46);
  ctx.restore();
}

/**
 * The end card: the mark again, the line worth remembering, and where to find
 * it. Rises over the last beat rather than cutting to black, so the film
 * finishes on the idea rather than on a logo.
 */
function endCard(ctx, w, h, palette, film, t) {
  const a = ease(span(t, 0.82, 0.08));
  if (a <= 0) return;

  ctx.save();
  ctx.globalAlpha = a;
  // A scrim, so whatever the last beat left on screen reads as behind this.
  ctx.fillStyle = 'rgba(8,8,12,0.88)';
  ctx.fillRect(0, 0, w, h);

  const lift = (1 - a) * 26;
  mark(ctx, w / 2, h * 0.34 + lift, 58, palette, film.name[0]);

  ctx.font = `700 34px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.fillText(film.name, w / 2, h * 0.34 + 72 + lift);

  ctx.font = `500 17px ${SANS}`;
  ctx.fillStyle = DIM;
  wipeText(ctx, film.tagline, w / 2, h * 0.34 + 104 + lift, span(t, 0.86, 0.08));

  // The call to action, in the brand's own colour.
  const cta = ease(span(t, 0.9, 0.06));
  if (cta > 0) {
    ctx.globalAlpha = a * cta;
    const label = film.cta;
    ctx.font = `600 13px ${MONO}`;
    const width = ctx.measureText(label).width + 36;
    const bx = w / 2 - width / 2;
    const by = h * 0.34 + 128 + lift;
    glow(ctx, palette.accent, 18, () => {
      ctx.fillStyle = palette.accentSoft;
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1;
      roundRect(ctx, bx, by, width, 32, 16);
      ctx.fill();
      ctx.stroke();
    });
    ctx.fillStyle = palette.accent;
    ctx.textAlign = 'center';
    ctx.fillText(label, w / 2, by + 21);
  }

  ctx.restore();
}

/* --- ArchForge ----------------------------------------------------------
   A sentence becomes a wired architecture, the capacity maths runs, and six
   pillars grade it.
------------------------------------------------------------------------ */

function archforge(ctx, t, w, h, p) {
  const cx = w / 2;

  // Beat one: the prompt, typed, with a caret.
  const typing = life(t, 0.2, 0.44, 0.05);
  if (typing > 0) {
    const prompt = '"a ride-sharing platform like Uber"';
    const typed = prompt.slice(0, Math.floor(span(t, 0.2, 0.12) * prompt.length));
    ctx.save();
    ctx.globalAlpha = typing;
    ctx.font = `500 20px ${MONO}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(typed, cx, h * 0.3);
    if (t < 0.34 && Math.floor(t * 40) % 2 === 0) {
      const width = ctx.measureText(typed).width;
      glow(ctx, p.accent, 10, () => {
        ctx.fillStyle = p.accent;
        ctx.fillRect(cx + width / 2 + 3, h * 0.3 - 16, 2, 20);
      });
    }
    ctx.restore();
  }

  // Beat two: the graph, wiring itself under the prompt.
  const graphAlive = life(t, 0.34, 0.74, 0.07);
  if (graphAlive > 0) {
    const top = h * 0.42;
    const nodes = [
      [cx - 150, top, 'client'],
      [cx, top, 'gateway'],
      [cx + 150, top, 'auth'],
      [cx - 78, top + 62, 'matching'],
      [cx + 78, top + 62, 'pricing'],
      [cx, top + 124, 'store'],
    ];
    const edges = [
      [0, 1],
      [1, 2],
      [1, 3],
      [1, 4],
      [3, 5],
      [4, 5],
    ];

    ctx.save();
    ctx.globalAlpha = graphAlive;

    // Edges draw themselves, then carry a packet along their length.
    edges.forEach(([a, b], i) => {
      const drawn = span(t, 0.46 + i * 0.012, 0.08);
      if (drawn <= 0) return;
      const [x1, y1] = nodes[a];
      const [x2, y2] = nodes[b];
      const ex = x1 + (x2 - x1) * drawn;
      const ey = y1 + (y2 - y1) * drawn;
      glow(ctx, p.accent, 8, () => {
        ctx.strokeStyle = p.edge;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      });

      const packet = span(t, 0.58 + i * 0.018, 0.1);
      if (packet > 0 && packet < 1) {
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.arc(x1 + (x2 - x1) * packet, y1 + (y2 - y1) * packet, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    nodes.forEach(([x, y, label], i) => {
      const a = overshoot(span(t, 0.36 + i * 0.022, 0.1));
      if (a <= 0) return;
      ctx.save();
      ctx.globalAlpha = graphAlive * Math.min(1, a);
      ctx.translate(x, y);
      ctx.scale(Math.min(1.08, a), Math.min(1.08, a));
      const bw = 108;
      const bh = 32;
      glow(ctx, 'rgba(0,0,0,0.6)', 12, () => {
        ctx.fillStyle = p.panel;
        roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 8);
        ctx.fill();
      });
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = 1;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 8);
      ctx.stroke();
      ctx.font = `600 12px ${MONO}`;
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.fillText(label, 0, 4);
      ctx.restore();
    });
    ctx.restore();
  }

  // Beat three: the six-pillar review, filling.
  const review = life(t, 0.62, 0.84, 0.06);
  if (review > 0) {
    const pillars = [
      ['scale', 0.92],
      ['data', 0.86],
      ['failure', 0.78],
      ['cost', 0.9],
      ['security', 0.74],
      ['ops', 0.82],
    ];
    const bw = 104;
    const gap = 14;
    const total = pillars.length * bw + (pillars.length - 1) * gap;
    let x = cx - total / 2;
    const y = h * 0.82;

    ctx.save();
    ctx.globalAlpha = review;
    ctx.font = `600 11px ${MONO}`;
    pillars.forEach(([label, score], i) => {
      const fill = ease(span(t, 0.66 + i * 0.016, 0.1));
      roundRect(ctx, x, y, bw, 6, 3);
      ctx.fillStyle = FAINT;
      ctx.fill();
      glow(ctx, p.accent, 10, () => {
        const g = ctx.createLinearGradient(x, 0, x + bw, 0);
        g.addColorStop(0, p.accent2);
        g.addColorStop(1, p.accent);
        ctx.fillStyle = g;
        roundRect(ctx, x, y, bw * score * fill, 6, 3);
        ctx.fill();
      });
      ctx.fillStyle = DIM;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + bw / 2, y + 22);
      x += bw + gap;
    });
    ctx.restore();
  }
}

/* --- Hindsight ----------------------------------------------------------
   A call is sealed before the outcome, the market happens, the call is graded
   against it.
------------------------------------------------------------------------ */

/** The market line. A fixed walk — the same curve in every render. */
function marketY(baseY, p) {
  return (
    baseY +
    Math.sin(p * 7.2) * 26 +
    Math.sin(p * 3.1 + 1.2) * 18 -
    p * 70 +
    Math.sin(p * 17) * 5
  );
}

function hindsight(ctx, t, w, h, p) {
  const cx = w / 2;

  // Beat one: the call, written and then sealed shut.
  const sealing = life(t, 0.2, 0.46, 0.06);
  if (sealing > 0) {
    const bw = 420;
    const bh = 92;
    const x = cx - bw / 2;
    const y = h * 0.26;
    const shut = ease(span(t, 0.34, 0.08));

    ctx.save();
    ctx.globalAlpha = sealing;
    glow(ctx, 'rgba(0,0,0,0.7)', 18, () => {
      ctx.fillStyle = p.panel;
      roundRect(ctx, x, y, bw, bh, 12);
      ctx.fill();
    });
    ctx.strokeStyle = shut > 0.5 ? p.accent : p.stroke;
    ctx.lineWidth = 1.2;
    roundRect(ctx, x, y, bw, bh, 12);
    ctx.stroke();

    ctx.font = `600 17px ${SANS}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    wipeText(ctx, 'A call, written down before the outcome', cx, y + 38, span(t, 0.22, 0.1));

    ctx.font = `500 12px ${MONO}`;
    ctx.fillStyle = DIM;
    ctx.globalAlpha = sealing * ease(span(t, 0.3, 0.06));
    ctx.textAlign = 'center';
    ctx.fillText('sha256 · timestamped · immutable', cx, y + 64);

    // The seal itself: a band that closes across the card.
    if (shut > 0) {
      ctx.globalAlpha = sealing * shut;
      glow(ctx, p.accent, 16, () => {
        ctx.fillStyle = p.accent;
        ctx.fillRect(x, y + bh - 4, bw * shut, 3);
      });
    }
    ctx.restore();
  }

  // Beat two: the market, drawing itself out.
  const drawn = span(t, 0.4, 0.3);
  const lineAlive = life(t, 0.38, 0.92, 0.06);
  if (lineAlive > 0 && drawn > 0) {
    const x0 = 90;
    const x1 = w - 90;
    const width = x1 - x0;
    const baseY = h * 0.66;

    ctx.save();
    ctx.globalAlpha = lineAlive;

    // The area under the line, so it reads as a market rather than a squiggle.
    const area = ctx.createLinearGradient(0, baseY - 70, 0, h);
    area.addColorStop(0, p.accentSoft);
    area.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = area;
    ctx.beginPath();
    ctx.moveTo(x0, h);
    for (let i = 0; i <= 120 * drawn; i += 1) {
      const q = i / 120;
      ctx.lineTo(x0 + width * q, marketY(baseY, q));
    }
    ctx.lineTo(x0 + width * drawn, h);
    ctx.closePath();
    ctx.fill();

    glow(ctx, p.accent, 14, () => {
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i <= 120 * drawn; i += 1) {
        const q = i / 120;
        const x = x0 + width * q;
        const y = marketY(baseY, q);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    if (drawn < 1) {
      const x = x0 + width * drawn;
      const y = marketY(baseY, drawn);
      glow(ctx, p.accent, 16, () => {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  // Beat three: the grade, which can only exist after the line.
  const graded = life(t, 0.72, 0.9, 0.05);
  if (graded > 0) {
    const bw = 460;
    const bh = 64;
    const x = cx - bw / 2;
    const y = h * 0.3;
    ctx.save();
    ctx.globalAlpha = graded;
    glow(ctx, p.accent, 22, () => {
      ctx.fillStyle = p.accentSoft;
      roundRect(ctx, x, y, bw, bh, 12);
      ctx.fill();
    });
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.2;
    roundRect(ctx, x, y, bw, bh, 12);
    ctx.stroke();

    ctx.font = `600 18px ${SANS}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText('Graded against what actually happened', cx, y + 28);
    ctx.font = `500 12px ${MONO}`;
    ctx.fillStyle = DIM;
    ctx.fillText('every claim traces back to a source url', cx, y + 50);
    ctx.restore();
  }
}

/* --- ClipStudio ---------------------------------------------------------
   Clips land on three tracks, a playhead sweeps them, and the export happens
   on the machine rather than on somebody's server.
------------------------------------------------------------------------ */

function clipstudio(ctx, t, w, h, p) {
  const left = 90;
  const right = w - 90;
  const width = right - left;
  const top = h * 0.3;
  const trackH = 44;
  const gap = 16;

  const tracks = [
    {
      label: 'video',
      clips: [
        [0, 0.42],
        [0.46, 0.34],
        [0.84, 0.16],
      ],
    },
    {
      label: 'audio',
      clips: [
        [0, 0.72],
        [0.76, 0.24],
      ],
    },
    {
      label: 'text',
      clips: [
        [0.12, 0.2],
        [0.4, 0.26],
        [0.72, 0.22],
      ],
    },
  ];

  const alive = life(t, 0.2, 0.9, 0.06);
  if (alive <= 0) return;
  ctx.save();
  ctx.globalAlpha = alive;

  tracks.forEach((track, ti) => {
    const y = top + ti * (trackH + gap);

    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = DIM;
    ctx.textAlign = 'right';
    ctx.fillText(track.label, left - 16, y + trackH / 2 + 4);

    roundRect(ctx, left, y, width, trackH, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fill();

    track.clips.forEach((clip, ci) => {
      // Clips drop in from above, each a beat after the last.
      const a = overshoot(span(t, 0.22 + ti * 0.06 + ci * 0.04, 0.1));
      if (a <= 0) return;
      const [start, len] = clip;
      const drop = (1 - Math.min(1, a)) * -26;
      ctx.save();
      ctx.globalAlpha = alive * Math.min(1, a);
      const cxx = left + width * start + 3;
      const cw = width * len - 6;
      const isText = ti === 2;
      glow(ctx, isText ? p.accent2 : p.accent, 12, () => {
        const g = ctx.createLinearGradient(cxx, y, cxx, y + trackH);
        g.addColorStop(0, isText ? p.accent2Soft : p.accentSoft);
        g.addColorStop(1, 'rgba(255,255,255,0.03)');
        ctx.fillStyle = g;
        roundRect(ctx, cxx, y + 5 + drop, cw, trackH - 10, 5);
        ctx.fill();
      });
      ctx.strokeStyle = isText ? p.accent2 : p.accent;
      ctx.lineWidth = 1;
      roundRect(ctx, cxx, y + 5 + drop, cw, trackH - 10, 5);
      ctx.stroke();

      // Waveform on the audio track, so the three are not the same object
      // drawn in three colours.
      if (ti === 1 && cw > 40) {
        ctx.globalAlpha = alive * 0.5;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < cw; i += 4) {
          const amp = (Math.sin(i * 0.11) + Math.sin(i * 0.37 + 1)) * 4;
          ctx.moveTo(cxx + i, y + trackH / 2 + drop - amp);
          ctx.lineTo(cxx + i, y + trackH / 2 + drop + amp);
        }
        ctx.stroke();
      }
      ctx.restore();
    });
  });

  // The playhead, sweeping once the timeline is laid out.
  const sweep = span(t, 0.46, 0.3);
  if (sweep > 0) {
    const x = left + width * Math.min(1, sweep);
    const bottom = top + tracks.length * (trackH + gap);
    glow(ctx, INK, 10, () => {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, top - 16);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    });
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(x - 6, top - 22);
    ctx.lineTo(x + 6, top - 22);
    ctx.lineTo(x, top - 12);
    ctx.closePath();
    ctx.fill();
  }

  // The export, locally.
  const exported = life(t, 0.74, 0.9, 0.05);
  if (exported > 0) {
    const y = top + tracks.length * (trackH + gap) + 26;
    const bw = 420;
    ctx.save();
    ctx.globalAlpha = exported;
    glow(ctx, p.accent, 20, () => {
      ctx.fillStyle = p.accentSoft;
      roundRect(ctx, w / 2 - bw / 2, y, bw, 58, 12);
      ctx.fill();
    });
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.2;
    roundRect(ctx, w / 2 - bw / 2, y, bw, 58, 12);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `600 17px ${SANS}`;
    ctx.fillStyle = INK;
    ctx.fillText('A real MP4, encoded on your machine', w / 2, y + 26);
    ctx.font = `500 12px ${MONO}`;
    ctx.fillStyle = DIM;
    ctx.fillText('webcodecs · nothing is uploaded to render', w / 2, y + 46);
    ctx.restore();
  }

  ctx.restore();
}

/* --- Marque.ai ----------------------------------------------------------
   A goal falls through five layers and a campaign comes out the bottom.
------------------------------------------------------------------------ */

function marque(ctx, t, w, h, p) {
  const cx = w / 2;
  const layers = [
    ['A goal goes in', SANS, true],
    ['intent classification', MONO, false],
    ['brand memory', MONO, false],
    ['signal check', MONO, false],
    ['A campaign comes out', SANS, true],
  ];
  const bw = 420;
  const bh = 46;
  const gap = 20;
  const top = h * 0.26;

  const alive = life(t, 0.2, 0.9, 0.06);
  if (alive <= 0) return;
  ctx.save();
  ctx.globalAlpha = alive;

  layers.forEach(([label, font, loud], i) => {
    const a = overshoot(span(t, 0.22 + i * 0.1, 0.12));
    if (a <= 0) return;
    const y = top + i * (bh + gap);
    const last = i === layers.length - 1;

    ctx.save();
    ctx.globalAlpha = alive * Math.min(1, a);
    // Each layer slides in from alternating sides, which gives the fall a
    // rhythm instead of five identical fades.
    ctx.translate((1 - Math.min(1, a)) * (i % 2 === 0 ? -40 : 40), 0);

    glow(ctx, last ? p.accent : 'rgba(0,0,0,0.5)', last ? 24 : 12, () => {
      ctx.fillStyle = last ? p.accentSoft : p.panel;
      roundRect(ctx, cx - bw / 2, y, bw, bh, 10);
      ctx.fill();
    });
    ctx.strokeStyle = last || i === 0 ? p.accent : p.stroke;
    ctx.lineWidth = 1.1;
    roundRect(ctx, cx - bw / 2, y, bw, bh, 10);
    ctx.stroke();

    ctx.font = `600 ${loud ? 17 : 13}px ${font}`;
    ctx.fillStyle = loud ? INK : DIM;
    ctx.textAlign = 'center';
    fit(ctx, label, cx, y + bh / 2 + 5.5, bw - 40);
    ctx.restore();

    // The request falling to the next layer, as a packet on a hairline.
    if (i < layers.length - 1) {
      const fall = span(t, 0.3 + i * 0.1, 0.07);
      if (fall > 0) {
        ctx.save();
        ctx.globalAlpha = alive * Math.min(1, a);
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, y + bh);
        ctx.lineTo(cx, y + bh + gap);
        ctx.stroke();
        glow(ctx, p.accent, 10, () => {
          ctx.fillStyle = p.accent;
          ctx.beginPath();
          ctx.arc(cx, y + bh + gap * Math.min(1, fall), 3.2, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }
    }
  });

  // The stack, which is the part of the claim that can be checked.
  const stack = life(t, 0.74, 0.9, 0.05);
  if (stack > 0) {
    ctx.globalAlpha = alive * stack;
    ctx.textAlign = 'center';
    ctx.font = `500 12px ${MONO}`;
    ctx.fillStyle = DIM;
    ctx.fillText(
      'react · fastapi · postgres · dockerised end to end',
      cx,
      top + layers.length * (bh + gap) + 10,
    );
  }

  ctx.restore();
}

/* --- the films ---------------------------------------------------------- */

const PALETTES = {
  /** ArchForge: blueprint blue, because it draws architectures. */
  blueprint: {
    bg: '#07090F',
    bloom: 'rgba(76,141,255,0.20)',
    bloom2: 'rgba(120,86,255,0.16)',
    grid: 'rgba(76,141,255,0.5)',
    accent: '#5B9CFF',
    accent2: '#8E7BFF',
    accentSoft: 'rgba(91,156,255,0.16)',
    accent2Soft: 'rgba(142,123,255,0.16)',
    edge: 'rgba(91,156,255,0.75)',
    panel: 'rgba(13,18,30,0.92)',
    stroke: 'rgba(255,255,255,0.14)',
  },
  /** Hindsight: a terminal green that reads as a market. */
  market: {
    bg: '#050B09',
    bloom: 'rgba(43,214,146,0.18)',
    bloom2: 'rgba(53,214,232,0.12)',
    grid: 'rgba(43,214,146,0.45)',
    accent: '#2BD692',
    accent2: '#35D6E8',
    accentSoft: 'rgba(43,214,146,0.16)',
    accent2Soft: 'rgba(53,214,232,0.16)',
    edge: 'rgba(43,214,146,0.7)',
    panel: 'rgba(9,20,16,0.92)',
    stroke: 'rgba(255,255,255,0.14)',
  },
  /** ClipStudio: amber, the colour of a timeline. */
  timeline: {
    bg: '#0C0803',
    bloom: 'rgba(255,170,64,0.18)',
    bloom2: 'rgba(255,92,92,0.12)',
    grid: 'rgba(255,170,64,0.4)',
    accent: '#FFAA40',
    accent2: '#FF6B6B',
    accentSoft: 'rgba(255,170,64,0.16)',
    accent2Soft: 'rgba(255,107,107,0.16)',
    edge: 'rgba(255,170,64,0.7)',
    panel: 'rgba(24,16,8,0.92)',
    stroke: 'rgba(255,255,255,0.14)',
  },
  /** Marque: magenta, the app's own family, used once rather than four times. */
  brand: {
    bg: '#0B0710',
    bloom: 'rgba(248,68,100,0.20)',
    bloom2: 'rgba(192,64,220,0.16)',
    grid: 'rgba(248,68,100,0.42)',
    accent: '#F84464',
    accent2: '#C040DC',
    accentSoft: 'rgba(248,68,100,0.16)',
    accent2Soft: 'rgba(192,64,220,0.16)',
    edge: 'rgba(248,68,100,0.7)',
    panel: 'rgba(22,12,24,0.92)',
    stroke: 'rgba(255,255,255,0.14)',
  },
};

const FILMS = {
  archforge: {
    draw: archforge,
    palette: PALETTES.blueprint,
    name: 'ArchForge',
    kicker: 'system design, verified',
    tagline: 'Describe a system. Get one that holds up.',
    cta: 'archforge.vercel.app',
  },
  hindsight: {
    draw: hindsight,
    palette: PALETTES.market,
    name: 'Hindsight',
    kicker: 'sealed, then graded',
    tagline: 'Scored by a harness you can run yourself.',
    cta: 'research project',
  },
  clipstudio: {
    draw: clipstudio,
    palette: PALETTES.timeline,
    name: 'ClipStudio',
    kicker: 'editing, in the browser',
    tagline: 'A timeline editor that never leaves the tab.',
    cta: 'runs in the tab',
  },
  marque: {
    draw: marque,
    palette: PALETTES.brand,
    name: 'Marque.ai',
    kicker: 'goal in, campaign out',
    tagline: 'A goal in, a campaign out, nothing hand-waved.',
    cta: 'full stack',
  },
};

/**
 * Draws one frame of one film onto `canvas` at progress `t`.
 *
 * Pure: the same arguments produce the same pixels, whenever and however
 * often it is called. The capture script depends on exactly that.
 */
function renderFrame(canvas, filmName, t) {
  const film = FILMS[filmName];
  if (!film) throw new Error(`no such film: ${filmName}`);

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const p = film.palette;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  stage(ctx, w, h, p, t);

  // A slow push in across the whole film, the one camera move. Scenes are
  // drawn inside it so everything shares the motion rather than each element
  // inventing its own.
  ctx.save();
  const zoom = 1 + 0.035 * ease(t);
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-w / 2, -h / 2);
  film.draw(ctx, t, w, h, p);
  ctx.restore();

  titleCard(ctx, w, h, p, film, t);
  houseLabel(ctx, w, t);
  endCard(ctx, w, h, p, film, t);

  // The progress hairline the whole set shares.
  glow(ctx, p.accent, 8, () => {
    ctx.fillStyle = p.accent;
    ctx.fillRect(0, h - 2, w * t, 2);
  });
}

if (typeof window !== 'undefined') {
  window.AD_FILMS = FILMS;
  window.renderFrame = renderFrame;
}
