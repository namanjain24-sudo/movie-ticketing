import { ambiguousShowtimeIds } from '../ambiguous-times';

const slot = (id: string, startsAt: string, format = 'TWO_D', language = 'Hindi') =>
  ({ id, startsAt, format, language }) as never;

const AT = (hour: number) => `2026-11-13T${String(hour).padStart(2, '0')}:00:00.000Z`;

describe('ambiguousShowtimeIds', () => {
  it('finds nothing to disambiguate in an ordinary day', () => {
    expect(ambiguousShowtimeIds([slot('a', AT(10)), slot('b', AT(13)), slot('c', AT(20))])).toEqual(
      new Set(),
    );
  });

  it('flags every showing that shares a face with another', () => {
    // Four screens, one film, one minute: the reason this exists.
    const clashing = ambiguousShowtimeIds([
      slot('audi1', AT(16)),
      slot('audi3', AT(16)),
      slot('audi4', AT(16)),
      slot('evening', AT(20)),
    ]);

    expect(clashing).toEqual(new Set(['audi1', 'audi3', 'audi4']));
  });

  it('leaves a clash alone when the chip already tells them apart', () => {
    // 4:45 in 2D and 4:45 in IMAX are visibly different rows already, and a
    // room number on each would be noise.
    expect(
      ambiguousShowtimeIds([slot('flat', AT(16), 'TWO_D'), slot('imax', AT(16), 'IMAX')]),
    ).toEqual(new Set());
  });

  it('counts language too, which the chip also shows', () => {
    expect(
      ambiguousShowtimeIds([
        slot('hindi', AT(16), 'TWO_D', 'Hindi'),
        slot('english', AT(16), 'TWO_D', 'English'),
      ]),
    ).toEqual(new Set());
  });

  it('has nothing to say about an empty day', () => {
    expect(ambiguousShowtimeIds([])).toEqual(new Set());
  });
});
