import { prisma } from '../db';
import { verifyInvariants } from './verify-invariants';

/**
 * Reads the database after a load run and answers the only questions the
 * report is allowed to make claims about.
 *
 * Written to be pasted straight into docs/load-testing.md, including the runs
 * that failed. A clean sheet from a suite that has never caught anything is
 * not evidence.
 */

async function main() {
  const cinema = await prisma.cinema.findUnique({
    where: { slug: 'loadtest-arena' },
    select: { id: true },
  });
  if (!cinema) throw new Error('Load-test cinema is missing. Run `npm run db:seed` first.');

  const showtime = await prisma.showtime.findFirstOrThrow({
    where: { screen: { cinemaId: cinema.id } },
    select: { id: true },
  });

  const seatStates = await prisma.showSeat.groupBy({
    by: ['state'],
    where: { showtimeId: showtime.id },
    _count: { _all: true },
  });
  const countOf = (state: string) => seatStates.find((s) => s.state === state)?._count._all ?? 0;

  const inventory = seatStates.reduce((sum, s) => sum + s._count._all, 0);
  const confirmed = countOf('CONFIRMED');
  const oversells = Math.max(0, confirmed - inventory);

  const doubleCharged = await prisma.$queryRaw<{ bookingId: string; captured: bigint }[]>`
    SELECT "bookingId", COUNT(*)::bigint AS captured
    FROM "Payment"
    WHERE status = 'CAPTURED'
    GROUP BY "bookingId"
    HAVING COUNT(*) > 1
  `;

  const orphanedHolds = await prisma.hold.count({
    where: { showtimeId: showtime.id, status: 'ACTIVE', expiresAt: { lt: new Date() } },
  });

  const bookings = await prisma.booking.groupBy({
    by: ['status'],
    where: { showtimeId: showtime.id },
    _count: { _all: true },
  });
  const payments = await prisma.payment.groupBy({
    by: ['status'],
    where: { booking: { showtimeId: showtime.id } },
    _count: { _all: true },
  });

  const violations = await verifyInvariants();

  const row = (label: string, value: string | number) =>
    console.log(`| ${label.padEnd(28)} | ${String(value).padStart(10)} |`);

  console.log('');
  console.log('Load run result');
  console.log('');
  console.log('| Metric                       |      Value |');
  console.log('| ---------------------------- | ---------- |');
  row('Inventory', inventory);
  row('Seats confirmed', confirmed);
  row('Oversells', oversells);
  row('Double charges', doubleCharged.length);
  row('Orphaned holds', orphanedHolds);
  row('Seats still held', countOf('HELD'));
  row('Seats available', countOf('AVAILABLE'));
  row('Invariants violated', violations.length);
  console.log('');

  console.log('Bookings');
  for (const b of bookings) console.log(`  ${b.status.padEnd(12)} ${b._count._all}`);
  console.log('Payments');
  for (const p of payments) console.log(`  ${p.status.padEnd(12)} ${p._count._all}`);
  console.log('');

  const passed = oversells === 0 && doubleCharged.length === 0 && violations.length === 0;
  if (passed) {
    console.log('PASS  no oversells, no double charges, all invariants hold.');
  } else {
    console.log('FAIL  see the numbers above and `npm run verify:invariants` for detail.');
    for (const v of violations) console.log(`  ${v.check}: ${v.count} row(s)`);
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
