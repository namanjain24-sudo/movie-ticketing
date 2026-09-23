import type { ShowtimeSummary } from '@app/shared';
import { groupByMovie } from '../group-by-movie';

function showtime(id: string, movieId: string, movieTitle: string): ShowtimeSummary {
  return {
    id,
    startsAt: '2026-01-01T10:00:00.000Z',
    endsAt: '2026-01-01T12:00:00.000Z',
    format: 'TWO_D',
    language: 'Hindi',
    currency: 'INR',
    salesCloseAt: '2026-01-01T10:00:00.000Z',
    fromPriceMinor: 25_000,
    availability: 'PLENTY',
    movie: { id: movieId, slug: movieTitle, title: movieTitle, posterUrl: '' },
  };
}

describe('groupByMovie', () => {
  it('keeps a single film to a single group', () => {
    const groups = groupByMovie([showtime('s1', 'm1', 'Jawan'), showtime('s2', 'm1', 'Jawan')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.showtimes.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('tells two films at the same cinema apart', () => {
    const groups = groupByMovie([
      showtime('s1', 'm1', 'Jawan'),
      showtime('s2', 'm2', 'Pathaan'),
      showtime('s3', 'm1', 'Jawan'),
    ]);
    expect(groups.map((g) => g.movie.title)).toEqual(['Jawan', 'Pathaan']);
    expect(groups.find((g) => g.movie.id === 'm1')?.showtimes.map((s) => s.id)).toEqual([
      's1',
      's3',
    ]);
  });

  it('returns nothing for an empty list', () => {
    expect(groupByMovie([])).toEqual([]);
  });
});
