import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { env } from '../env';

/**
 * Puts the database into a known state for a load run and writes the fixture
 * k6 reads.
 *
 * Two things matter here. The inventory is reset to an exact, stated number,
 * because "0 oversells" means nothing without a denominator. And the virtual
 * users are real rows with real signed tokens, so the run exercises the same
 * authentication path a phone does rather than a bypass built for the test.
 */

const VIRTUAL_USERS = Number(process.env.LOAD_TEST_USERS ?? 5_000);
const BASE_URL = process.env.LOAD_TEST_BASE_URL ?? `http://localhost:${env.PORT}`;
const OUTPUT = resolve(import.meta.dirname, '../../../../loadtest/fixture.json');

/** Long enough that a run cannot fail because tokens aged out mid-test. */
const TOKEN_TTL = '4h';

async function main() {
  const cinema = await prisma.cinema.findUnique({
    where: { slug: 'loadtest-arena' },
    select: { id: true },
  });
  if (!cinema) {
    throw new Error('Load-test cinema is missing. Run `npm run db:seed` first.');
  }

  const showtime = await prisma.showtime.findFirst({
    where: { screen: { cinemaId: cinema.id } },
    select: { id: true, salesCloseAt: true, screen: { select: { id: true } } },
  });
  if (!showtime) throw new Error('Load-test showtime is missing. Run `npm run db:seed` first.');

  console.log('Resetting inventory…');

  // Clear everything the previous run left behind, so the report describes one
  // run rather than an accumulation.
  await prisma.payment.deleteMany({ where: { booking: { showtimeId: showtime.id } } });
  await prisma.showSeat.updateMany({
    where: { showtimeId: showtime.id },
    data: { state: 'AVAILABLE', holdId: null, holdExpiresAt: null, bookingId: null },
  });
  await prisma.booking.deleteMany({ where: { showtimeId: showtime.id } });
  await prisma.hold.deleteMany({ where: { showtimeId: showtime.id } });
  await prisma.idempotencyRecord.deleteMany();
  await prisma.webhookEvent.deleteMany();

  // Push the sales cutoff out so a long run cannot trip it.
  await prisma.showtime.update({
    where: { id: showtime.id },
    data: {
      startsAt: new Date(Date.now() + 12 * 60 * 60_000),
      endsAt: new Date(Date.now() + 15 * 60 * 60_000),
      salesCloseAt: new Date(Date.now() + 12 * 60 * 60_000),
    },
  });

  const seats = await prisma.showSeat.findMany({
    where: { showtimeId: showtime.id },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Creating ${VIRTUAL_USERS} virtual users…`);

  // Deleted and recreated each run so a stale token pool cannot silently make
  // a run test fewer distinct users than it claims.
  await prisma.user.deleteMany({ where: { email: { endsWith: '@loadtest.local' } } });

  const tokens: string[] = [];
  const BATCH = 500;
  for (let offset = 0; offset < VIRTUAL_USERS; offset += BATCH) {
    const size = Math.min(BATCH, VIRTUAL_USERS - offset);
    const data = Array.from({ length: size }, (_, i) => ({
      email: `vu-${offset + i}@loadtest.local`,
      name: `Virtual User ${offset + i}`,
      // These accounts never sign in with a password; the run uses tokens.
      passwordHash: 'load-test-account-no-password-login',
    }));
    await prisma.user.createMany({ data });
    const created = await prisma.user.findMany({
      where: { email: { in: data.map((d) => d.email) } },
      select: { id: true },
    });
    for (const user of created) {
      tokens.push(
        jwt.sign({ sub: user.id, type: 'access' }, env.JWT_ACCESS_SECRET, {
          expiresIn: TOKEN_TTL,
        }),
      );
    }
  }

  const fixture = {
    baseUrl: BASE_URL,
    showtimeId: showtime.id,
    inventory: seats.length,
    seatIds: seats.map((s) => s.id),
    tokens,
    preparedAt: new Date().toISOString(),
  };

  mkdirSync(resolve(OUTPUT, '..'), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(fixture));

  console.log('');
  console.log(`Showtime  ${fixture.showtimeId}`);
  console.log(`Inventory ${fixture.inventory} seats, all available`);
  console.log(`Users     ${tokens.length}`);
  console.log(`Target    ${BASE_URL}`);
  console.log(`Fixture   ${OUTPUT}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
