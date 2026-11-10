/**
 * The path of a marker stroke, drawn rather than drawn-looking.
 *
 * A straight rectangle under a heading is a rule. What is wanted here is the
 * mark somebody makes with a chisel-tip pen: it starts a little before the
 * word, overshoots it, is thicker in the middle than at the ends, and does
 * not sit level. All four of those are small; together they are the whole
 * difference between a graphic and a gesture.
 *
 * Deterministic from `seed`, which the caller takes from the heading's own
 * text. The same section is marked the same way every time it renders - a
 * stroke that reshuffled on each scroll would read as a glitch - while two
 * different sections get two different strokes, so a column of headings does
 * not look stamped.
 */

/**
 * A small, fast, seeded generator. Not for anything that matters: its whole
 * job is to make four numbers that are stable for a given heading.
 */
function jitter(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turns a heading into a seed, so the same words always get the same stroke. */
export function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * An SVG path for a marker stroke `width` long inside a box `height` tall.
 *
 * Returns an empty string for a box with no area, which is what a caller gets
 * on the first frame before the text it is measuring has been laid out. An
 * empty `d` draws nothing; a malformed one draws a warning in the console on
 * every frame.
 */
export function markerPath(width: number, height: number, seed: number): string {
  if (!(width > 0) || !(height > 0)) return '';

  const rand = jitter(seed);
  // Overshoot, because a pen does not stop on the letter.
  const x0 = -height * 0.35;
  const x1 = width + height * 0.3;
  const span = x1 - x0;

  // Thickest in the middle, and never thicker than the box.
  const thick = height * (0.52 + rand() * 0.16);
  const thin = thick * (0.3 + rand() * 0.2);
  // A degree or two off level, in whichever direction this heading drew.
  const tilt = (rand() - 0.5) * height * 0.5;

  const midY = height / 2;
  const topLeft = midY - thin / 2;
  const topMid = midY - thick / 2 + tilt * 0.25;
  const topRight = midY - thin / 2 + tilt;
  const bottomRight = topRight + thin;
  const bottomMid = topMid + thick;
  const bottomLeft = topLeft + thin;

  const q1 = x0 + span * 0.3;
  const q2 = x0 + span * 0.7;
  const mid = x0 + span * 0.5;

  return (
    `M ${x0.toFixed(2)} ${topLeft.toFixed(2)} ` +
    `Q ${q1.toFixed(2)} ${(topMid - thin * 0.2).toFixed(2)} ${mid.toFixed(2)} ${topMid.toFixed(2)} ` +
    `Q ${q2.toFixed(2)} ${(topMid + thin * 0.1).toFixed(2)} ${x1.toFixed(2)} ${topRight.toFixed(2)} ` +
    `L ${x1.toFixed(2)} ${bottomRight.toFixed(2)} ` +
    `Q ${q2.toFixed(2)} ${(bottomMid + thin * 0.1).toFixed(2)} ${mid.toFixed(2)} ${bottomMid.toFixed(2)} ` +
    `Q ${q1.toFixed(2)} ${(bottomMid - thin * 0.2).toFixed(2)} ${x0.toFixed(2)} ${bottomLeft.toFixed(2)} Z`
  );
}
