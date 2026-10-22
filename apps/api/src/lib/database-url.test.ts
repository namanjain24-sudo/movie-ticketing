import { describe, expect, it } from 'vitest';
import { pinConnectionToUtc } from './database-url';

describe('pinConnectionToUtc', () => {
  it('appends the option to a bare URL', () => {
    expect(pinConnectionToUtc('postgresql://user:pw@host:5432/db')).toBe(
      'postgresql://user:pw@host:5432/db?options=-c%20timezone%3DUTC',
    );
  });

  it('joins with & when the URL already has a query', () => {
    expect(pinConnectionToUtc('postgresql://user:pw@host/db?sslmode=require')).toBe(
      'postgresql://user:pw@host/db?sslmode=require&options=-c%20timezone%3DUTC',
    );
  });

  // The local .env and docker-compose already spell the option out. Appending
  // a second one would be at best redundant and at worst contradictory.
  it('leaves a URL that already sets options alone', () => {
    const already = 'postgresql://user:pw@host/db?options=-c%20timezone%3DUTC';
    expect(pinConnectionToUtc(already)).toBe(already);
    const other = 'postgresql://user:pw@host/db?options=-c%20statement_timeout%3D5000';
    expect(pinConnectionToUtc(other)).toBe(other);
  });

  /**
   * A managed Postgres generates the password, and generated passwords
   * routinely contain characters a URL parser would re-encode. Appending a
   * query parameter must never rewrite the credential.
   */
  it('does not touch a password containing URL-significant characters', () => {
    const url = 'postgresql://user:p%40ss+w/rd!@host:5432/db';
    expect(pinConnectionToUtc(url)).toBe(`${url}?options=-c%20timezone%3DUTC`);
  });
});
