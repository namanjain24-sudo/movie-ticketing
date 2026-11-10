import { cheapestAt, cheapestInList, cheapestIsWorthMarking, orderCinemas } from '../ordering';

type Slot = { id: string; startsAt: string; fromPriceMinor: number };

const slot = (id: string, startsAt: string, fromPriceMinor: number) =>
  ({ id, startsAt, fromPriceMinor }) as never;

const venue = (name: string, distanceKm: number | null, ...showtimes: Slot[]) =>
  ({ cinema: { name, distanceKm }, showtimes }) as never;

const names = (list: { cinema: { name: string } }[]) => list.map((e) => e.cinema.name);

const AT = (h: number) => `2026-11-10T${String(h).padStart(2, '0')}:00:00.000Z`;

describe('cheapestAt', () => {
  it("is the lowest price among a cinema's showings", () => {
    expect(cheapestAt(venue('a', 1, slot('s1', AT(12), 40_000), slot('s2', AT(18), 22_000)))).toBe(
      22_000,
    );
  });

  it('is null for a cinema with nothing left', () => {
    expect(cheapestAt(venue('a', 1))).toBe(null);
  });
});

describe('cheapestInList', () => {
  it('is the lowest price anywhere, so one row can be marked as the cheapest', () => {
    expect(
      cheapestInList([
        venue('pricey', 1, slot('s1', AT(12), 45_000)),
        venue('cheap', 9, slot('s2', AT(12), 18_000)),
      ]),
    ).toBe(18_000);
  });

  it('is null when there is nothing to compare', () => {
    expect(cheapestInList([])).toBe(null);
    expect(cheapestInList([venue('empty', 1)])).toBe(null);
  });
});

describe('orderCinemas', () => {
  const list = [
    venue('near-and-dear', 1, slot('a', AT(20), 45_000)),
    venue('far-and-cheap', 12, slot('b', AT(13), 15_000)),
    venue('middle', 5, slot('c', AT(16), 30_000)),
  ];

  it('leaves the server order alone for nearest', () => {
    // The API already sorted by distance, rounding kilometres as it went. A
    // client re-sort can disagree with that rounding, which would reorder the
    // list for no reason anybody could see.
    expect(names(orderCinemas(list, 'nearest'))).toEqual([
      'near-and-dear',
      'far-and-cheap',
      'middle',
    ]);
  });

  it('puts the cheapest seat first, however far it is', () => {
    expect(names(orderCinemas(list, 'cheapest'))).toEqual([
      'far-and-cheap',
      'middle',
      'near-and-dear',
    ]);
  });

  it('puts the next showing first for earliest', () => {
    expect(names(orderCinemas(list, 'earliest'))).toEqual([
      'far-and-cheap',
      'middle',
      'near-and-dear',
    ]);
  });

  it('does not mutate the list it was given', () => {
    const before = names(list);
    orderCinemas(list, 'cheapest');
    expect(names(list)).toEqual(before);
  });

  it('keeps the arrival order when two cinemas cost the same', () => {
    // Relies on a stable sort, which is why it is asserted rather than
    // assumed: the arrival order is distance, so equal prices stay
    // nearest-first instead of shuffling.
    const tie = [
      venue('nearer', 2, slot('a', AT(20), 20_000)),
      venue('farther', 8, slot('b', AT(14), 20_000)),
    ];
    expect(names(orderCinemas(tie, 'cheapest'))).toEqual(['nearer', 'farther']);
  });

  it('sorts a cinema with no price left to the end, not to the front', () => {
    // Filtering can empty a cinema. Treating that as zero would advertise it
    // as the cheapest thing on the page.
    const withEmpty = [
      venue('has-shows', 5, slot('a', AT(16), 30_000)),
      venue('filtered-empty', 1),
    ];
    expect(names(orderCinemas(withEmpty, 'cheapest'))).toEqual(['has-shows', 'filtered-empty']);
  });

  it('ignores a start time the server could not have sent', () => {
    const broken = [
      venue('fine', 1, slot('a', AT(18), 20_000)),
      venue('broken', 2, slot('b', 'not-a-date', 20_000)),
    ];
    expect(names(orderCinemas(broken, 'earliest'))).toEqual(['fine', 'broken']);
  });
});

describe('cheapestIsWorthMarking', () => {
  it('is worth marking when one venue is dearer', () => {
    expect(
      cheapestIsWorthMarking([
        venue('cheap', 1, slot('a', AT(18), 22_000)),
        venue('dear', 2, slot('b', AT(18), 30_000)),
      ]),
    ).toBe(true);
  });

  it('is not worth marking when every venue opens at the same price', () => {
    // Found on a device: three cinemas all at ₹220, all three badged
    // "Cheapest". Every one was telling the truth and the badge said nothing.
    expect(
      cheapestIsWorthMarking([
        venue('a', 1, slot('a', AT(18), 22_000)),
        venue('b', 2, slot('b', AT(20), 22_000)),
        venue('c', 3, slot('c', AT(21), 22_000)),
      ]),
    ).toBe(false);
  });

  it('is not worth marking with a single venue, which cannot undercut itself', () => {
    expect(cheapestIsWorthMarking([venue('only', 1, slot('a', AT(18), 22_000))])).toBe(false);
  });

  it('is not worth marking when two venues tie for cheapest', () => {
    // Found on a device: two cinemas at 220 and one dearer put the word
    // CHEAPEST on two different rows, which is a contradiction rather than a
    // recommendation. The sort control already reads "Cheapest · ₹220" for
    // somebody who wants the whole band.
    expect(
      cheapestIsWorthMarking([
        venue('a', 1, slot('a', AT(18), 22_000)),
        venue('b', 2, slot('b', AT(20), 22_000)),
        venue('c', 3, slot('c', AT(21), 30_000)),
      ]),
    ).toBe(false);
  });

  it('is worth marking when exactly one venue is under the rest', () => {
    expect(
      cheapestIsWorthMarking([
        venue('cheap', 1, slot('a', AT(18), 20_000)),
        venue('b', 2, slot('b', AT(20), 22_000)),
        venue('c', 3, slot('c', AT(21), 22_000)),
      ]),
    ).toBe(true);
  });

  it('is not worth marking when there is nothing to compare', () => {
    expect(cheapestIsWorthMarking([])).toBe(false);
    expect(cheapestIsWorthMarking([venue('empty', 1)])).toBe(false);
  });

  it('ignores a venue left empty by a filter rather than calling it dearer', () => {
    expect(
      cheapestIsWorthMarking([
        venue('has', 1, slot('a', AT(18), 22_000)),
        venue('filtered-empty', 2),
      ]),
    ).toBe(false);
  });
});
