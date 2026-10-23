import type { SeatTier } from '@prisma/client';
import { prisma } from '../src/db';

/**
 * Keeps the schedule rolling forward.
 *
 * `seed.ts` lays down seven days of showtimes and `seed-if-empty.ts` refuses
 * to run again once there is a catalogue, which is right — the seed is
 * destructive and must never wipe a booking. The consequence is that a
 * deployment goes quietly empty a week after it was seeded: the catalogue is
 * still there, every film still lists, and nothing can be booked because no
 * screening is in the future. Nothing in the system reports that as broken,
 * because it is not broken. It is just over.
 *
 * This extends instead of reseeding. It never deletes, never touches an
 * existing showtime, and never looks at a booking. It finds the first day
 * inside the horizon where some screen has nothing on, and replays the
 * pattern that screen is already running — same slots, same formats, same
 * tier prices — against whatever is now showing. One day per run, so a boot
 * is never held up for long.
 *
 * Reading the pattern from the database rather than from the seed's constants
 * is deliberate: this stays correct if the seed is edited, and it means a
 * screen that was never seeded is left alone rather than invented for.
 */

/** How far ahead a booking should always be possible. */
const HORIZON_DAYS = 10;

/** Midnight, local to the server, `offset` days from today. */
function dayStart(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

type Pattern = {
  screenId: string;
  /** Minutes past midnight, so a slot survives being moved to another date. */
  minutesIntoDay: number;
  format: 'TWO_D' | 'THREE_D' | 'IMAX' | 'FOUR_DX';
  language: string;
  durationMins: number;
  prices: { tier: SeatTier; priceMinor: number }[];
};

/**
 * The shape of a normal day for every screen that has one.
 *
 * Taken from the most recent day that actually has showtimes, so a screen
 * whose schedule was thinned out by hand keeps its thinner schedule.
 */
async function readPattern(): Promise<Pattern[]> {
  const last = await prisma.showtime.findFirst({
    orderBy: { startsAt: 'desc' },
    select: { startsAt: true },
  });
  if (!last) return [];

  const from = new Date(last.startsAt);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);

  const rows = await prisma.showtime.findMany({
    where: { startsAt: { gte: from, lt: to } },
    select: {
      screenId: true,
      startsAt: true,
      endsAt: true,
      format: true,
      language: true,
      tierPrices: { select: { tier: true, priceMinor: true } },
    },
  });

  return rows.map((r) => ({
    screenId: r.screenId,
    minutesIntoDay: r.startsAt.getHours() * 60 + r.startsAt.getMinutes(),
    format: r.format,
    language: r.language,
    // The seed adds twenty minutes of turnaround; recovering the runtime from
    // the pair keeps that arithmetic in one place.
    durationMins: Math.round((r.endsAt.getTime() - r.startsAt.getTime()) / 60_000) - 20,
    prices: r.tierPrices,
  }));
}

/**
 * The first day inside the horizon that is missing screenings, and which
 * screens are missing them.
 *
 * Per screen rather than per day, because a run that is interrupted half way
 * leaves a day with *some* showtimes, and a day-level check would then call
 * that day done and never finish it.
 *
 * One day per run on purpose. A day is around a hundred showtimes and tens of
 * thousands of inventory rows, and this runs on a boot that something is
 * waiting on. Successive runs catch up, and the horizon is far enough ahead
 * that catching up over a few days is invisible.
 */
async function nextGap(
  screenIds: string[],
): Promise<{ offset: number; screens: Set<string> } | null> {
  for (let offset = 0; offset <= HORIZON_DAYS; offset++) {
    const start = dayStart(offset);
    const end = dayStart(offset + 1);
    const present = await prisma.showtime.findMany({
      where: { startsAt: { gte: start, lt: end } },
      select: { screenId: true },
      distinct: ['screenId'],
    });
    const have = new Set(present.map((p) => p.screenId));
    const missing = new Set(screenIds.filter((id) => !have.has(id)));
    if (missing.size > 0) return { offset, screens: missing };
  }
  return null;
}

/**
 * A screen's seats, read once.
 *
 * Every showtime on a screen materialises the same seat list, and asking the
 * database for it per showtime was most of the time this script spent: a
 * hundred identical queries a day, against screens with up to two thousand
 * rows each.
 */
const seatCache = new Map<string, { id: string; tier: SeatTier }[]>();
async function seatsOf(screenId: string) {
  let seats = seatCache.get(screenId);
  if (!seats) {
    seats = await prisma.seat.findMany({
      where: { screenId },
      select: { id: true, tier: true },
    });
    seatCache.set(screenId, seats);
  }
  return seats;
}

async function createFromPattern(pattern: Pattern, offset: number, movieId: string) {
  const startsAt = dayStart(offset);
  startsAt.setMinutes(pattern.minutesIntoDay);
  const endsAt = new Date(startsAt.getTime() + (pattern.durationMins + 20) * 60_000);
  // Booking stays open until ten minutes after the show starts, as in the seed.
  const salesCloseAt = new Date(startsAt.getTime() + 10 * 60_000);

  const showtime = await prisma.showtime.create({
    data: {
      movieId,
      screenId: pattern.screenId,
      startsAt,
      endsAt,
      salesCloseAt,
      format: pattern.format,
      language: pattern.language,
      tierPrices: { create: pattern.prices },
    },
    select: { id: true },
  });

  const byTier = new Map(pattern.prices.map((p) => [p.tier, p.priceMinor]));
  const seats = await seatsOf(pattern.screenId);

  // Inventory is materialised up front, for the same reason it is in the seed:
  // a seat row that does not exist cannot be locked, and creating it during a
  // booking would reopen the race the locks exist to close.
  await prisma.showSeat.createMany({
    data: seats
      .filter((s) => byTier.has(s.tier))
      .map((seat) => ({
        showtimeId: showtime.id,
        seatId: seat.id,
        priceMinor: byTier.get(seat.tier)!,
      })),
  });

  return seats.length;
}

async function main() {
  const pattern = await readPattern();
  if (pattern.length === 0) {
    // Nothing to copy from. An empty database is the seed's job, not this
    // script's, and inventing a schedule for screens that never had one would
    // be guessing.
    console.log('[extend-showtimes] No existing showtimes to take a pattern from.');
    return;
  }

  const screenIds = [...new Set(pattern.map((p) => p.screenId))];
  const gap = await nextGap(screenIds);
  if (!gap) {
    console.log(`[extend-showtimes] Every screen has something on for ${HORIZON_DAYS} days.`);
    return;
  }

  const movies = await prisma.movie.findMany({
    where: { isNowShowing: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (movies.length === 0) {
    console.log('[extend-showtimes] Nothing is now showing.');
    return;
  }

  const slots = pattern.filter((p) => gap.screens.has(p.screenId));
  const day = dayStart(gap.offset).toISOString().slice(0, 10);
  console.log(
    `[extend-showtimes] ${day} is short on ${gap.screens.size} screen(s). ` +
      `Replaying ${slots.length} slot(s).`,
  );

  let created = 0;
  let seats = 0;
  for (const [index, slot] of slots.entries()) {
    // Rotated by day and slot so the same film is not on every screen at
    // once, the way the seed picks.
    const movie = movies[(gap.offset + index) % movies.length]!;
    seats += await createFromPattern(slot, gap.offset, movie.id);
    created++;
  }

  console.log(`[extend-showtimes] Added ${created} showtimes, ${seats} seat inventory rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
