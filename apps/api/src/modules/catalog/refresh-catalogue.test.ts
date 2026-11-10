import { beforeEach, describe, expect, it } from 'vitest';
import { refreshCatalogue } from '../../../prisma/refresh-catalogue';
import { prisma } from '../../db';
import { createShowtime, createUser, resetDb } from '../../test/helpers';

/**
 * What happens to a database that was seeded before the column existed.
 *
 * This is the production case and the one nothing covered. A migration adds a
 * column with a default, every existing row takes it, and the feature built
 * on that column is invisible for ever — deployed, in the payload, always
 * empty. The helper here creates showtimes exactly that way, so these tests
 * start from the state the live database was actually in.
 */
describe('refreshCatalogue', () => {
  beforeEach(resetDb);

  it('fills in the advertising minutes a ticket needs to name the film start', async () => {
    const made = await createShowtime();

    const filled = await refreshCatalogue(prisma);

    expect(filled.adsMinutes).toBeGreaterThan(0);
    const after = await prisma.showtime.findUniqueOrThrow({
      where: { id: made.showtimeId },
      select: { adsMinutes: true },
    });
    expect(after.adsMinutes).toBeGreaterThan(0);
  });

  it('discloses accessibility on a minority of screenings, not all of them', async () => {
    // A disclosure on every row would be as useless as one on none, and the
    // seed's own rule is deliberately sparse.
    for (let i = 0; i < 40; i += 1) await createShowtime({ seatCount: 1 });

    await refreshCatalogue(prisma);

    const total = await prisma.showtime.count();
    const disclosed = await prisma.showtime.count({ where: { accessibility: { isEmpty: false } } });
    expect(disclosed).toBeGreaterThan(0);
    expect(disclosed).toBeLessThan(total);
  });

  it('names the app wherever audio description is claimed', async () => {
    for (let i = 0; i < 40; i += 1) await createShowtime({ seatCount: 1 });

    await refreshCatalogue(prisma);

    const described = await prisma.showtime.findMany({
      where: { accessibility: { has: 'AUDIO_DESCRIPTION' } },
      select: { accessibilityVia: true },
    });
    expect(described.length).toBeGreaterThan(0);
    for (const row of described) expect(row.accessibilityVia).toBeTruthy();
  });

  it('gives a concession item its photograph and the credit it needs', async () => {
    await prisma.concessionItem.create({
      data: { name: 'Classic popcorn (large)', description: 'Salted.', priceMinor: 25_000 },
    });

    const filled = await refreshCatalogue(prisma);

    expect(filled.concessionImages).toBe(1);
    const after = await prisma.concessionItem.findFirstOrThrow({
      where: { name: 'Classic popcorn (large)' },
    });
    expect(after.imageUrl).toBeTruthy();
    // Never one without the other: a CC BY photograph with no author named
    // is a licence breach.
    expect(after.imageCredit).toBeTruthy();
  });

  it('does nothing the second time, which is why it is safe on every boot', async () => {
    await createShowtime();
    await prisma.concessionItem.create({
      data: { name: 'Classic popcorn (large)', description: 'Salted.', priceMinor: 25_000 },
    });

    await refreshCatalogue(prisma);
    const again = await refreshCatalogue(prisma);

    expect(again).toEqual({ adsMinutes: 0, accessibility: 0, concessionImages: 0 });
  });

  it('leaves a figure somebody set deliberately alone', async () => {
    const made = await createShowtime();
    await prisma.showtime.update({ where: { id: made.showtimeId }, data: { adsMinutes: 5 } });

    await refreshCatalogue(prisma);

    const after = await prisma.showtime.findUniqueOrThrow({
      where: { id: made.showtimeId },
      select: { adsMinutes: true },
    });
    expect(after.adsMinutes).toBe(5);
  });

  it('touches nothing a person owns', async () => {
    const alice = await createUser('alice');
    await createShowtime();

    await refreshCatalogue(prisma);

    const still = await prisma.user.findUnique({
      where: { id: alice.id },
      select: { email: true },
    });
    expect(still?.email).toBe(alice.email);
    expect(await prisma.booking.count()).toBe(0);
  });
});
