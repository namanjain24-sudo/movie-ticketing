import type { CinemaShowtimes } from '@app/shared';
import { markClosed, nextCloseAfter } from '../closing';

const T = (iso: string) => new Date(iso).getTime();

const slot = (id: string, salesCloseAt: string) =>
  ({ id, salesCloseAt, startsAt: salesCloseAt, endsAt: salesCloseAt }) as never;

const list = (...closes: [string, string][]): CinemaShowtimes[] => [
  { cinema: { id: 'c1' }, showtimes: closes.map(([id, at]) => slot(id, at)) } as never,
];

describe('markClosed', () => {
  it('closes a screening whose window has passed and leaves the rest', () => {
    const out = markClosed(
      list(['past', '2026-10-28T10:00:00.000Z'], ['soon', '2026-10-28T18:00:00.000Z']),
      T('2026-10-28T12:00:00.000Z'),
    );
    expect(out[0].showtimes.map((s) => [s.id, s.closed])).toEqual([
      ['past', true],
      ['soon', false],
    ]);
  });

  it('counts the instant itself as closed, matching the server', () => {
    // holds.service refuses on `salesCloseAt <= now`. A chip that still looked
    // bookable on the exact second would be offering what the API refuses.
    const at = '2026-10-28T12:00:00.000Z';
    const out = markClosed(list(['edge', at]), T(at));
    expect(out[0].showtimes[0].closed).toBe(true);
  });

  it('leaves the cinemas and the order alone', () => {
    const out = markClosed(list(['a', '2026-10-28T18:00:00.000Z']), T('2026-10-28T12:00:00.000Z'));
    expect(out).toHaveLength(1);
    expect(out[0].cinema.id).toBe('c1');
  });
});

describe('nextCloseAfter', () => {
  it('is the soonest window still to shut, not the soonest in the list', () => {
    expect(
      nextCloseAfter(
        list(
          ['late', '2026-10-28T22:00:00.000Z'],
          ['past', '2026-10-28T09:00:00.000Z'],
          ['next', '2026-10-28T18:00:00.000Z'],
        ),
        T('2026-10-28T12:00:00.000Z'),
      ),
    ).toBe(T('2026-10-28T18:00:00.000Z'));
  });

  it('looks across every cinema, not only the first', () => {
    const two: CinemaShowtimes[] = [
      { cinema: { id: 'c1' }, showtimes: [slot('a', '2026-10-28T20:00:00.000Z')] } as never,
      { cinema: { id: 'c2' }, showtimes: [slot('b', '2026-10-28T15:00:00.000Z')] } as never,
    ];
    expect(nextCloseAfter(two, T('2026-10-28T12:00:00.000Z'))).toBe(T('2026-10-28T15:00:00.000Z'));
  });

  it('answers null when the day is done, so no timer is left open', () => {
    expect(
      nextCloseAfter(list(['past', '2026-10-28T09:00:00.000Z']), T('2026-10-28T12:00:00.000Z')),
    ).toBeNull();
  });

  it('answers null for an empty list', () => {
    expect(nextCloseAfter([], T('2026-10-28T12:00:00.000Z'))).toBeNull();
  });

  it('does not count the instant itself, which is already closed', () => {
    const at = '2026-10-28T12:00:00.000Z';
    expect(nextCloseAfter(list(['edge', at]), T(at))).toBeNull();
  });
});
