/**
 * Pins a Postgres connection's timezone to UTC, unless the URL already
 * carries connection options.
 *
 * This is load-bearing, not tidiness. Prisma maps `DateTime` to `timestamp
 * without time zone`, so on a server initialised in any other zone every value
 * shifts on the round trip and the expiry model breaks silently: holds read as
 * expired, sales read as closed, and the failures look like a locking bug
 * rather than a clock one.
 *
 * Locally this never surfaced because Docker's Postgres image runs in UTC and
 * `.env.example` spells the option out. A managed Postgres hands over a URL
 * fully formed, with no opportunity to add it — which is exactly the case this
 * exists for.
 *
 * Deliberately not `new URL()`: a Postgres password may contain characters
 * that round-trip differently through the WHATWG parser, and this only ever
 * needs to append.
 */
export function pinConnectionToUtc(url: string): string {
  if (/[?&]options=/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}options=-c%20timezone%3DUTC`;
}
