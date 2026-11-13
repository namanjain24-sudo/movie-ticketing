import { TEXTURE_ICONS, textureMarks } from '../texture';

describe('textureMarks', () => {
  it('draws nothing on an area with no area', () => {
    expect(textureMarks(0, 800)).toEqual([]);
    expect(textureMarks(400, 0)).toEqual([]);
    expect(textureMarks(Number.NaN, 800)).toEqual([]);
  });

  it('is the same field every time, so it does not reshuffle on scroll', () => {
    expect(textureMarks(411, 900)).toEqual(textureMarks(411, 900));
  });

  it('covers the page rather than a corner of it', () => {
    const marks = textureMarks(411, 900);

    expect(marks.length).toBeGreaterThan(20);
    expect(Math.min(...marks.map((m) => m.x))).toBeLessThan(104);
    expect(Math.max(...marks.map((m) => m.x))).toBeGreaterThan(411 - 2 * 104);
    expect(Math.max(...marks.map((m) => m.y))).toBeGreaterThan(900 - 2 * 104);
  });

  it('keeps every glyph fully on the page', () => {
    // A mark half off the edge reads as a bug rather than as texture.
    for (const mark of textureMarks(411, 900)) {
      expect(mark.x).toBeGreaterThanOrEqual(0);
      expect(mark.y).toBeGreaterThanOrEqual(0);
      expect(mark.x + mark.size).toBeLessThanOrEqual(411);
      expect(mark.y + mark.size).toBeLessThanOrEqual(900);
    }
  });

  it('does not line the marks up, which would read as a grid', () => {
    const marks = textureMarks(411, 900);
    const columns = new Set(marks.map((m) => Math.round(m.x)));

    expect(columns.size).toBeGreaterThan(4);
  });

  it('tilts them a little and never a lot', () => {
    for (const mark of textureMarks(411, 900)) {
      expect(Math.abs(mark.rotate)).toBeLessThanOrEqual(18);
    }
  });

  it('only ever asks for an icon the set has', () => {
    for (const mark of textureMarks(411, 900)) {
      expect(TEXTURE_ICONS).toContain(mark.icon);
    }
  });

  it('uses more than one icon, or it is a field of one thing', () => {
    expect(new Set(textureMarks(411, 900).map((m) => m.icon)).size).toBeGreaterThan(2);
  });
});
