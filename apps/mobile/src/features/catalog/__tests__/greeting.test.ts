import { partOfDay, whenItIs } from '../greeting';

/** A local-time date, so none of this depends on the runner's timezone. */
const at = (year: number, month: number, day: number, hour: number) =>
  new Date(year, month - 1, day, hour, 30);

describe('partOfDay', () => {
  it.each([
    [5, 'morning'],
    [9, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [21, 'evening'],
    [22, 'night'],
    [23, 'night'],
    [0, 'night'],
    [4, 'night'],
  ])("calls %i o'clock %s", (hour, expected) => {
    expect(partOfDay(at(2026, 11, 6, hour))).toBe(expected);
  });
});

describe('whenItIs', () => {
  it('names the day and the part of it', () => {
    // Friday 6 November 2026, half past seven in the evening.
    expect(whenItIs(at(2026, 11, 6, 19))).toBe('Friday evening');
  });

  it('distinguishes a Tuesday from a Friday, which is the point of saying it', () => {
    expect(whenItIs(at(2026, 11, 3, 19))).toBe('Tuesday evening');
  });

  it('goes late rather than claiming an evening at eleven', () => {
    expect(whenItIs(at(2026, 11, 6, 23))).toBe('Late Friday');
  });

  it('still calls 1am Saturday a late Friday, because people do', () => {
    // Saturday 7 November, 1:30am. Technically Saturday, socially Friday night.
    expect(whenItIs(at(2026, 11, 7, 1))).toBe('Late Friday');
  });

  it('rolls the week around correctly before dawn on a Sunday', () => {
    // Sunday 8 November, 2:30am -> the Saturday night that is still going.
    expect(whenItIs(at(2026, 11, 8, 2))).toBe('Late Saturday');
  });

  it('is a morning again by six', () => {
    expect(whenItIs(at(2026, 11, 7, 6))).toBe('Saturday morning');
  });
});
