import { prisma } from '../src/db';
import { seed } from './seed';
import { seedEvents } from './seed-events';

/**
 * Runs the seed only when the catalogue is empty.
 *
 * This exists because of where it is called from: a hosted service's start
 * command, which runs again on every deploy, every restart, and — on a free
 * plan that spins down when idle — every time the service wakes up.
 *
 * `prisma/seed.ts` is destructive by design. It clears bookings, payments,
 * holds and reviews before rebuilding the catalogue, which is exactly right
 * for a local reset and exactly wrong on a boot, where it would quietly
 * delete every ticket anyone had booked since the last restart.
 *
 * So the question asked here is narrow: has this database ever been seeded?
 * A catalogue with no films cannot have been. Anything else is left alone.
 */
async function main() {
  const films = await prisma.movie.count();

  if (films === 0) {
    console.log('[seed-if-empty] Empty catalogue, seeding.');
    // Awaited, not spawned: a failure propagates as a rejection and the start
    // command stops, rather than the API booting onto an empty catalogue.
    await seed();
    return;
  }

  console.log(`[seed-if-empty] ${films} films already present, leaving the films alone.`);

  /**
   * Events are asked about separately, because they arrived after this
   * database was first seeded.
   *
   * The film check above answers "has this ever been seeded", and for an
   * existing deployment that is yes — so a deploy carrying the events
   * migration would land the empty tables and nothing to put in them, and the
   * Events tab would be permanently empty in production with no way to fix it
   * short of someone holding the database credentials.
   *
   * `seedEvents` only ever creates, and its venues have their own slugs, so
   * asking the narrower question is safe: are there any events? If not, add
   * them, and leave every film, booking and ticket exactly where it is.
   */
  const events = await prisma.event.count();
  if (events > 0) {
    console.log(`[seed-if-empty] ${events} events already present, leaving them alone.`);
    return;
  }

  console.log('[seed-if-empty] No events yet, adding the live-events catalogue.');
  const added = await seedEvents(prisma);
  console.log(
    `[seed-if-empty] ${added.events} events at ${added.venues} venues, ` +
      `${added.shows} shows, ${added.seats} seat inventory rows.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
