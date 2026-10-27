import type { ShowtimeSummary } from '@app/shared';
import { applyFilter, filterOptions, partOfDay } from '../showtime-filters';

/** A showtime at a given local hour today, which is what the filter reads. */
const at = (hour: number, extra: Partial<ShowtimeSummary> = {}): ShowtimeSummary => {
  const d = new Date();
  d.setHours(hour, 15, 0, 0);
  return {
    id: `s${hour}`,
    startsAt: d.toISOString(),
    endsAt: d.toISOString(),
    format: 'TWO_D',
    language: 'Hindi',
    currency: 'INR',
    salesCloseAt: d.toISOString(),
    fromPriceMinor: 30000,
    availability: 'PLENTY',
    movie: null,
    event: null,
    ...extra,
  } as ShowtimeSummary;
};

describe('partOfDay', () => {
  it('files a show by the hour it starts, locally', () => {
    expect(partOfDay(at(9).startsAt)).toBe('morning');
    expect(partOfDay(at(13).startsAt)).toBe('afternoon');
    expect(partOfDay(at(19).startsAt)).toBe('evening');
    expect(partOfDay(at(22).startsAt)).toBe('night');
  });

  it('puts the boundaries on the later side', () => {
    // Noon is afternoon, five is evening, nine is night. A show at exactly
    // the boundary belongs to the part of the day it opens, not the one it
    // just left.
    expect(partOfDay(at(12).startsAt)).toBe('afternoon');
    expect(partOfDay(at(17).startsAt)).toBe('evening');
    expect(partOfDay(at(21).startsAt)).toBe('night');
  });

  it('reads local hours, so a late show is never filed as morning', () => {
    // The seed's last slot is 22:45. Read as UTC in a positive-offset zone it
    // would roll past midnight and come back as Morning, which is how
    // somebody looking for a late show gets offered breakfast.
    const late = at(22);
    expect(partOfDay(late.startsAt)).toBe('night');
  });
});

describe('filterOptions', () => {
  it('offers only the parts of the day that exist, in the order of the day', () => {
    const cinemas = [{ showtimes: [at(22), at(9), at(19)] }];
    expect(filterOptions(cinemas).parts.map((p) => p.id)).toEqual([
      'morning',
      'evening',
      'night',
    ]);
  });
});

describe('applyFilter', () => {
  it('keeps only the shows in the chosen part of the day', () => {
    const cinemas = [{ showtimes: [at(9), at(19), at(22)] }];
    const evening = applyFilter(cinemas, { partOfDay: 'evening' });
    expect(evening[0]?.showtimes.map((s) => s.id)).toEqual(['s19']);
  });

  it('drops a cinema with nothing left rather than showing it empty', () => {
    const cinemas = [{ showtimes: [at(9)] }, { showtimes: [at(19)] }];
    expect(applyFilter(cinemas, { partOfDay: 'evening' })).toHaveLength(1);
  });

  it('combines with the format filter rather than replacing it', () => {
    const cinemas = [
      { showtimes: [at(19), at(20, { id: 's20', format: 'IMAX' }), at(9)] },
    ];
    const out = applyFilter(cinemas, { partOfDay: 'evening', format: 'IMAX' });
    expect(out[0]?.showtimes.map((s) => s.id)).toEqual(['s20']);
  });

  it('returns the list untouched when nothing is chosen', () => {
    const cinemas = [{ showtimes: [at(9), at(19)] }];
    expect(applyFilter(cinemas, {})).toBe(cinemas);
  });
});
