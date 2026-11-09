import type { CinemaShowtimes } from '@app/shared';
import { SOON_WINDOW_MINUTES, nextStartingSoonChangeAfter, startingSoon } from '../starting-soon';

const T = (iso: string) => new Date(iso).getTime();
const NOW = T('2026-10-28T12:00:00.000Z');

/** Minutes from `NOW`, as the ISO string the API would have sent. */
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

type SlotSpec = {
  id: string;
  /** Minutes from `NOW`. */
  starts: number;
  /** Minutes from `NOW`. Defaults to the start, which is what the API sends. */
  closes?: number;
  availability?: string;
};

const slot = (s: SlotSpec) =>
  ({
    id: s.id,
    startsAt: at(s.starts),
    endsAt: at(s.starts + 120),
    salesCloseAt: at(s.closes ?? s.starts),
    availability: s.availability ?? 'PLENTY',
    fromPriceMinor: 25000,
    currency: 'INR',
    format: '2D',
    language: 'Hindi',
    movie: { id: 'm1', slug: 'a-film', title: 'A Film', posterUrl: 'p.jpg' },
    event: null,
  }) as never;

const venue = (id: string, distanceKm: number | null, ...slots: SlotSpec[]): CinemaShowtimes =>
  ({
    cinema: { id, name: id, distanceKm },
    showtimes: slots.map(slot),
  }) as never;

const ids = (cinemas: CinemaShowtimes[], now = NOW) =>
  startingSoon(cinemas, now).map((row) => row.id);

describe('startingSoon', () => {
  it('offers a show that has not started, is selling, has seats and is reachable', () => {
    expect(ids([venue('nearby', 2, { id: 'catchable', starts: 60 })])).toEqual(['catchable']);
  });

  it('drops a show that has already begun', () => {
    expect(ids([venue('nearby', 2, { id: 'gone', starts: -5 })])).toEqual([]);
  });

  it('drops a show on the exact instant it starts', () => {
    expect(ids([venue('nearby', 2, { id: 'edge', starts: 0 })])).toEqual([]);
  });

  it('drops a show that has stopped selling even though it has not started', () => {
    // The API closes sales before the lights go down, so this is an ordinary
    // state rather than an edge case: bookable-looking and not bookable.
    expect(ids([venue('nearby', 2, { id: 'shut', starts: 60, closes: -1 })])).toEqual([]);
  });

  it('drops a sold-out show', () => {
    expect(ids([venue('nearby', 2, { id: 'full', starts: 60, availability: 'SOLD_OUT' })])).toEqual(
      [],
    );
  });

  it('keeps an almost-full show, which is the one worth hurrying for', () => {
    expect(
      ids([venue('nearby', 2, { id: 'nearly', starts: 60, availability: 'ALMOST_FULL' })]),
    ).toEqual(['nearly']);
  });

  it('drops a show further beyond the window than the evening reaches', () => {
    expect(ids([venue('nearby', 2, { id: 'tomorrow', starts: SOON_WINDOW_MINUTES + 1 })])).toEqual(
      [],
    );
  });

  describe('getting there in time', () => {
    it('drops a show that starts before you could reach it', () => {
      // 15km is 45 minutes of assumed traffic plus a 10 minute buffer. A show
      // in 30 is not an offer, it is the app not knowing where you are.
      expect(ids([venue('far', 15, { id: 'unreachable', starts: 30 })])).toEqual([]);
    });

    it('keeps the same show once there is time to make it', () => {
      expect(ids([venue('far', 15, { id: 'reachable', starts: 70 })])).toEqual(['reachable']);
    });

    it('makes no travel claim when there is no position to make it from', () => {
      // Location denied: every distance is null, and a filter that invented a
      // journey would quietly empty the rail.
      expect(ids([venue('unknown', null, { id: 'kept', starts: 5 })])).toEqual(['kept']);
    });
  });

  describe('order', () => {
    it('puts the one about to go first', () => {
      expect(
        ids([venue('a', 1, { id: 'later', starts: 90 }, { id: 'sooner', starts: 40 })]),
      ).toEqual(['sooner', 'later']);
    });

    it('breaks a tie on distance, across cinemas', () => {
      expect(
        ids([
          venue('far', 8, { id: 'far-one', starts: 90 }),
          venue('near', 1, { id: 'near-one', starts: 90 }),
        ]),
      ).toEqual(['near-one', 'far-one']);
    });
  });

  it('reports whole minutes left, never a negative one', () => {
    const [row] = startingSoon([venue('a', 1, { id: 'x', starts: 42 })], NOW);
    expect(row.minutesUntil).toBe(42);
  });

  it('carries the cinema with each row, since a flat list has no other way back', () => {
    const [row] = startingSoon([venue('pvr-phoenix', 3, { id: 'x', starts: 60 })], NOW);
    expect(row.cinema.id).toBe('pvr-phoenix');
    expect(row.showtime.id).toBe('x');
  });

  it('ignores a slot whose dates the server could not have sent', () => {
    const broken = {
      cinema: { id: 'c', distanceKm: 1 },
      showtimes: [{ id: 'bad', startsAt: 'x', salesCloseAt: 'x', availability: 'PLENTY' }],
    } as never;
    expect(startingSoon([broken], NOW)).toEqual([]);
  });
});

describe('nextStartingSoonChangeAfter', () => {
  it('wakes when the next show becomes too late to reach', () => {
    // 2km is 6 minutes of traffic plus the 10 minute buffer, so a show in 60
    // stops being offerable 44 minutes from now.
    expect(nextStartingSoonChangeAfter([venue('near', 2, { id: 'x', starts: 60 })], NOW)).toBe(
      NOW + 44 * 60_000,
    );
  });

  it('wakes when a show enters the window before anything else happens', () => {
    const far = SOON_WINDOW_MINUTES + 30;
    expect(
      nextStartingSoonChangeAfter([venue('unknown', null, { id: 'x', starts: far })], NOW),
    ).toBe(NOW + 30 * 60_000);
  });

  it('is the soonest boundary in the whole list, not the first one found', () => {
    const out = nextStartingSoonChangeAfter(
      [
        venue('unknown', null, { id: 'late', starts: 120 }),
        venue('unknown2', null, { id: 'soon', starts: 20 }),
      ],
      NOW,
    );
    expect(out).toBe(NOW + 20 * 60_000);
  });

  it('answers null when every boundary is behind us, so no timer is held open', () => {
    expect(nextStartingSoonChangeAfter([venue('a', null, { id: 'done', starts: -30 })], NOW)).toBe(
      null,
    );
  });

  it('answers null for an empty list', () => {
    expect(nextStartingSoonChangeAfter([], NOW)).toBe(null);
  });
});
