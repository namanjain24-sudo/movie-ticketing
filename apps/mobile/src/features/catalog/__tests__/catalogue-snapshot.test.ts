import { isPublicQueryKey } from '../catalogue-snapshot';

/**
 * The allowlist is the privacy boundary, so it is asserted from both sides:
 * the catalogue keys that may be written to a plain file in the cache
 * directory, and the account keys that must never be.
 */
describe('isPublicQueryKey', () => {
  it.each([
    [['movies', {}]],
    [['movie', 'drishyam-the-conclusion']],
    [['cities']],
    [['coming-soon']],
    [['cinemas', {}]],
    [['cinema-brands']],
    [['events', {}]],
    [['promo-offers']],
    [['reviews', 'a-film', {}]],
  ])('keeps %j, which is the same for everybody', (key) => {
    expect(isPublicQueryKey(key)).toBe(true);
  });

  it.each([
    [['me']],
    [['bookings']],
    [['booking', 'BK-7F7STG']],
    [['loyalty-balance']],
    [['watchlist']],
    [['favorite-cinemas']],
    [['rewards']],
    [['plans']],
    [['plan', 'ABC123']],
    [['active-holds']],
    [['hold', 'hold_1']],
    [['payment', 'pay_1']],
    [['booking-split', 'b1']],
    [['cancellation', 'b1']],
  ])('refuses %j, which belongs to one account', (key) => {
    expect(isPublicQueryKey(key)).toBe(false);
  });

  it('refuses the seat map even though it is public', () => {
    // The largest payload in the product, and wrong within seconds.
    expect(isPublicQueryKey(['seatmap', 'st_1'])).toBe(false);
  });

  it('refuses a key that is not a list of strings at the head', () => {
    expect(isPublicQueryKey([])).toBe(false);
    expect(isPublicQueryKey([{ movies: true }])).toBe(false);
    expect(isPublicQueryKey([42])).toBe(false);
  });

  it('refuses anything new until somebody adds it on purpose', () => {
    // The point of an allowlist: a key nobody has considered is not public.
    expect(isPublicQueryKey(['something-added-next-week'])).toBe(false);
  });
});
