import { prisma } from '../src/db';
import { seed } from './seed';

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

  if (films > 0) {
    console.log(`[seed-if-empty] ${films} films already present, leaving the database alone.`);
    return;
  }

  console.log('[seed-if-empty] Empty catalogue, seeding.');
  // Awaited, not spawned: a failure propagates as a rejection and the start
  // command stops, rather than the API booting onto an empty catalogue.
  await seed();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
