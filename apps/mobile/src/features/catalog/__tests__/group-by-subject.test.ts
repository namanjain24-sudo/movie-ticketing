import type { EventKind, ShowtimeSummary } from '@app/shared';
import { groupBySubject } from '../group-by-subject';

const base = {
  startsAt: '2026-01-01T10:00:00.000Z',
  endsAt: '2026-01-01T12:00:00.000Z',
  format: 'TWO_D',
  language: 'Hindi',
  currency: 'INR',
  salesCloseAt: '2026-01-01T10:00:00.000Z',
  fromPriceMinor: 25_000,
  availability: 'PLENTY',
} satisfies Omit<ShowtimeSummary, 'id' | 'movie' | 'event'>;

function film(id: string, movieId: string, title: string): ShowtimeSummary {
  return {
    ...base,
    id,
    movie: { id: movieId, slug: title.toLowerCase(), title, posterUrl: '' },
    event: null,
  };
}

function fixture(id: string, eventId: string, title: string, kind: EventKind): ShowtimeSummary {
  return {
    ...base,
    id,
    movie: null,
    event: { id: eventId, slug: title.toLowerCase(), kind, title, posterUrl: '' },
  };
}

describe('groupBySubject', () => {
  it('keeps a single film to a single group', () => {
    const groups = groupBySubject([film('s1', 'm1', 'Jawan'), film('s2', 'm1', 'Jawan')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.showtimes.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('tells two films at the same cinema apart', () => {
    const groups = groupBySubject([
      film('s1', 'm1', 'Jawan'),
      film('s2', 'm2', 'Pathaan'),
      film('s3', 'm1', 'Jawan'),
    ]);
    expect(groups.map((g) => g.subject.title)).toEqual(['Jawan', 'Pathaan']);
    expect(groups.find((g) => g.subject.id === 'm1')?.showtimes.map((s) => s.id)).toEqual([
      's1',
      's3',
    ]);
  });

  /**
   * The reason this is grouped by subject rather than by film: a venue's
   * listing can hold a match and a gig as easily as two films, and a
   * stadium's holds nothing else.
   */
  it('groups events the same way, and never mixes one with a film', () => {
    const groups = groupBySubject([
      fixture('s1', 'e1', 'MI vs CSK', 'SPORT'),
      film('s2', 'm1', 'Jawan'),
      fixture('s3', 'e1', 'MI vs CSK', 'SPORT'),
      fixture('s4', 'e2', 'Arijit Singh Live', 'CONCERT'),
    ]);

    expect(groups.map((g) => g.subject.title)).toEqual(['MI vs CSK', 'Jawan', 'Arijit Singh Live']);
    expect(groups[0]?.showtimes.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('labels each group by what it actually is', () => {
    const groups = groupBySubject([
      film('s1', 'm1', 'Jawan'),
      fixture('s2', 'e1', 'MI vs CSK', 'SPORT'),
      fixture('s3', 'e2', 'Design Workshop', 'WORKSHOP'),
    ]);

    expect(groups.map((g) => g.subject.kindLabel)).toEqual(['Film', 'Match', 'Workshop']);
    expect(groups.map((g) => g.subject.href)).toEqual([
      '/movie/jawan',
      '/event/mi vs csk',
      '/event/design workshop',
    ]);
  });

  it('drops a showtime that names neither, rather than rendering a nameless group', () => {
    // The database refuses such a row; the type still allows one, and a group
    // with no title on it would be worse than one fewer group.
    const orphan = { ...base, id: 's1', movie: null, event: null } as ShowtimeSummary;

    expect(groupBySubject([orphan, film('s2', 'm1', 'Jawan')]).map((g) => g.subject.title)).toEqual(
      ['Jawan'],
    );
  });

  it('returns nothing for an empty list', () => {
    expect(groupBySubject([])).toEqual([]);
  });
});
