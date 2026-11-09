import type { AccessibilityFeature, ShowtimeSummary } from '@app/shared';
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
    expect(filterOptions(cinemas).parts.map((p) => p.id)).toEqual(['morning', 'evening', 'night']);
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
    const cinemas = [{ showtimes: [at(19), at(20, { id: 's20', format: 'IMAX' }), at(9)] }];
    const out = applyFilter(cinemas, { partOfDay: 'evening', format: 'IMAX' });
    expect(out[0]?.showtimes.map((s) => s.id)).toEqual(['s20']);
  });

  it('returns the list untouched when nothing is chosen', () => {
    const cinemas = [{ showtimes: [at(9), at(19)] }];
    expect(applyFilter(cinemas, {})).toBe(cinemas);
  });
});

describe('accessibility', () => {
  const withFeatures = (hour: number, accessibility: AccessibilityFeature[]) =>
    at(hour, { accessibility });

  it('offers only the features the day actually has, in a fixed order', () => {
    const cinemas = [
      {
        showtimes: [
          withFeatures(19, ['CLOSED_CAPTIONS']),
          withFeatures(21, ['INDIAN_SIGN_LANGUAGE', 'CLOSED_CAPTIONS']),
        ],
      },
    ];
    // Declared order, not discovery order, so the chips do not reshuffle with
    // whatever the day happened to contain.
    expect(filterOptions(cinemas).accessibility).toEqual([
      'CLOSED_CAPTIONS',
      'INDIAN_SIGN_LANGUAGE',
    ]);
  });

  it('offers nothing when no screening claims anything', () => {
    expect(filterOptions([{ showtimes: [at(19), at(21)] }]).accessibility).toEqual([]);
  });

  it('keeps only the screenings that carry the chosen feature', () => {
    const cinemas = [
      {
        showtimes: [
          withFeatures(14, ['AUDIO_DESCRIPTION']),
          withFeatures(19, ['CLOSED_CAPTIONS']),
          at(21),
        ],
      },
    ];
    const described = applyFilter(cinemas, { accessibility: 'AUDIO_DESCRIPTION' });
    expect(described[0]?.showtimes).toHaveLength(1);
    expect(described[0]?.showtimes[0]?.accessibility).toEqual(['AUDIO_DESCRIPTION']);
  });

  it('combines with the other filters rather than replacing them', () => {
    const cinemas = [
      {
        showtimes: [withFeatures(9, ['CLOSED_CAPTIONS']), withFeatures(19, ['CLOSED_CAPTIONS'])],
      },
    ];
    const evening = applyFilter(cinemas, {
      accessibility: 'CLOSED_CAPTIONS',
      partOfDay: 'evening',
    });
    expect(evening[0]?.showtimes).toHaveLength(1);
  });

  it('survives a showtime that has no accessibility array at all', () => {
    // The field is new. A response cached before it existed, or an older API,
    // has nothing here - and iterating `undefined` took the film page down
    // until this was guarded.
    const legacy = [{ showtimes: [{ ...at(19), accessibility: undefined } as never] }];
    expect(() => filterOptions(legacy)).not.toThrow();
    expect(filterOptions(legacy).accessibility).toEqual([]);
    expect(() => applyFilter(legacy, { accessibility: 'CLOSED_CAPTIONS' })).not.toThrow();
    expect(applyFilter(legacy, { accessibility: 'CLOSED_CAPTIONS' })).toEqual([]);
  });
});
