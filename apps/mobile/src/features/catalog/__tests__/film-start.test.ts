import { filmStartsAt } from '../film-start';

describe('filmStartsAt', () => {
  const SHOW = '2026-11-10T10:15:00.000Z';

  it('adds the advertising to the printed time', () => {
    expect(filmStartsAt(SHOW, 20)).toBe('2026-11-10T10:35:00.000Z');
  });

  it('says nothing when there is no advertising', () => {
    // An event runs no trailers. Printing the same time twice would be
    // noise dressed up as a disclosure.
    expect(filmStartsAt(SHOW, 0)).toBeNull();
  });

  it('says nothing rather than going backwards on a negative', () => {
    expect(filmStartsAt(SHOW, -5)).toBeNull();
  });

  it('says nothing for a date it cannot read', () => {
    // "Invalid Date" on a ticket is worse than no second time at all.
    expect(filmStartsAt('not a date', 20)).toBeNull();
  });

  it('says nothing for a figure that is not a number', () => {
    expect(filmStartsAt(SHOW, Number.NaN)).toBeNull();
  });

  it('carries into the next day for a late show', () => {
    // The catalogue's last slot is 22:45 and one showtime in five already
    // finishes on the following date.
    expect(filmStartsAt('2026-11-10T23:50:00.000Z', 20)).toBe('2026-11-11T00:10:00.000Z');
  });

  it('rounds a fractional figure rather than carrying seconds onto a clock', () => {
    expect(filmStartsAt(SHOW, 19.6)).toBe('2026-11-10T10:35:00.000Z');
  });
});
