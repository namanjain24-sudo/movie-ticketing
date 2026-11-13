/**
 * The marks that make up the page texture.
 *
 * A plain page is a plain page. WhatsApp's chat wallpaper is the reference:
 * a field of small doodles at an opacity you notice only when you look for
 * it, which gives a surface something to be rather than nothing.
 *
 * Laid out here rather than drawn, and the layout is the part worth testing.
 * A rigid grid reads as a grid; this walks a grid and then nudges every mark
 * off its own centre, so the field looks scattered by hand while staying
 * exactly the same on every render - a texture that reshuffled on scroll
 * would be the loudest thing on the screen rather than the quietest.
 */

/** Ionicons names, all of them things a cinema has. */
export const TEXTURE_ICONS = [
  'ticket-outline',
  'film-outline',
  'star-outline',
  'play-outline',
  'videocam-outline',
  'musical-notes-outline',
] as const;

export type TextureIcon = (typeof TEXTURE_ICONS)[number];

export interface TextureMark {
  key: string;
  /** Top-left of the glyph box, already inside the area. */
  x: number;
  y: number;
  size: number;
  /** Degrees. Small: a tilted field reads as a mistake, a nudged one reads as a hand. */
  rotate: number;
  icon: TextureIcon;
}

/** How far apart the marks sit before they are nudged. */
export const TEXTURE_CELL = 104;

/** Stable per cell, so a mark keeps its icon, its offset and its angle. */
function noise(col: number, row: number, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (const value of [col, row]) {
    hash ^= value + 0x9e3779b9;
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  return (hash >>> 0) / 4294967296;
}

export function textureMarks(width: number, height: number): TextureMark[] {
  if (!(width > 0) || !(height > 0)) return [];

  const marks: TextureMark[] = [];
  const cols = Math.ceil(width / TEXTURE_CELL);
  const rows = Math.ceil(height / TEXTURE_CELL);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const size = 20 + Math.round(noise(col, row, 3) * 6);
      // Nudged within its own cell, and kept far enough from the edge that a
      // glyph is never half off the page.
      const slack = TEXTURE_CELL - size;
      const x = col * TEXTURE_CELL + noise(col, row, 1) * slack;
      const y = row * TEXTURE_CELL + noise(col, row, 2) * slack;
      if (x > width - size || y > height - size) continue;

      marks.push({
        key: `${col}-${row}`,
        x,
        y,
        size,
        rotate: Math.round((noise(col, row, 4) - 0.5) * 36),
        icon: TEXTURE_ICONS[Math.floor(noise(col, row, 5) * TEXTURE_ICONS.length)] as TextureIcon,
      });
    }
  }
  return marks;
}
