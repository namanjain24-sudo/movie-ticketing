import { SPONSORS, sponsorById, sponsorOfTheDay } from '../sponsors';

describe('house ads', () => {
  it('every slot carries the copy a card needs to render honestly', () => {
    for (const sponsor of SPONSORS) {
      expect(sponsor.id).toMatch(/^[a-z]+$/);
      expect(sponsor.name.length).toBeGreaterThan(2);
      expect(sponsor.kicker.length).toBeGreaterThan(2);
      expect(sponsor.blurb.length).toBeGreaterThan(40);
      // Said in place of a link where there is no public URL, so a card is
      // never left with an empty call to action.
      expect(sponsor.note.length).toBeGreaterThan(2);
      expect(sponsor.accent).toMatch(/^#[0-9A-F]{6}$/i);
      expect(sponsor.film).toBeTruthy();
    }
  });

  it('only claims a link where there is one', () => {
    // A card renders an "opens in a browser" affordance from this field
    // alone, so a half-written URL here would be a dead tap in the app.
    for (const sponsor of SPONSORS) {
      if (sponsor.url !== undefined) expect(sponsor.url).toMatch(/^https:\/\/\S+\.\S+/);
    }
  });

  it('has no duplicate ids, since a FlatList keys on them', () => {
    expect(new Set(SPONSORS.map((s) => s.id)).size).toBe(SPONSORS.length);
  });

  it('finds a sponsor by id, and says so when there is none', () => {
    expect(sponsorById('archforge')?.name).toBe('ArchForge');
    expect(sponsorById('nothing-here')).toBeUndefined();
  });

  describe('sponsorOfTheDay', () => {
    it('is stable across a day, so the slot does not reshuffle under a thumb', () => {
      const morning = new Date('2026-10-27T06:30:00.000Z');
      const evening = new Date('2026-10-27T23:00:00.000Z');
      expect(sponsorOfTheDay(morning).id).toBe(sponsorOfTheDay(evening).id);
    });

    it('moves on the next day', () => {
      const today = sponsorOfTheDay(new Date('2026-10-27T10:00:00.000Z'));
      const tomorrow = sponsorOfTheDay(new Date('2026-10-28T10:00:00.000Z'));
      expect(today.id).not.toBe(tomorrow.id);
    });

    it('comes back round to every slot over a cycle', () => {
      const seen = new Set<string>();
      for (let day = 0; day < SPONSORS.length; day += 1) {
        seen.add(sponsorOfTheDay(new Date(Date.UTC(2026, 9, 27 + day))).id);
      }
      expect(seen.size).toBe(SPONSORS.length);
    });

    it('never indexes past the end, whatever the date', () => {
      // The epoch is before 1970 for a negative timestamp, and a plain
      // modulo would hand back `undefined` for it.
      const ancient = new Date('1960-01-01T00:00:00.000Z');
      expect(SPONSORS).toContain(sponsorOfTheDay(ancient));
    });
  });
});
