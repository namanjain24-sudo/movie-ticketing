import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { sweepOnce } from './sweeper';
import { createShowtime, createUser, resetDb, type TestShowtime } from '../test/helpers';

/** Comfortably past the three-day retention window. */
const LONG_AGO = -8 * 24 * 60;
/** Happened, but still inside the window. */
const YESTERDAY = -26 * 60;

/**
 * Removing screenings that have happened and that nobody booked.
 *
 * The reason this exists is storage: a seat map is a row per seat per
 * screening, the schedule is topped up on every boot and nothing ever removed
 * the days that fell off the back, so the table grew by about 35 MB a day for
 * ever. The reason it is dangerous is `Booking.showtimeId ON DELETE CASCADE`:
 * deleting the wrong screening does not leave a dangling ticket, it deletes
 * the ticket. Most of what follows is about that half.
 */
describe('pruning spent showtimes', () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function exists(show: TestShowtime): Promise<boolean> {
    return (await prisma.showtime.count({ where: { id: show.showtimeId } })) > 0;
  }

  it('removes a screening that has happened and was never booked', async () => {
    const old = await createShowtime({ startsInMinutes: LONG_AGO });

    const result = await sweepOnce();

    expect(result.spentShowtimesPurged).toBe(1);
    expect(await exists(old)).toBe(false);
  });

  it('takes the seat inventory and the tier prices with it', async () => {
    const old = await createShowtime({ startsInMinutes: LONG_AGO, seatCount: 12 });
    expect(await prisma.showSeat.count({ where: { showtimeId: old.showtimeId } })).toBe(12);

    await sweepOnce();

    expect(await prisma.showSeat.count({ where: { showtimeId: old.showtimeId } })).toBe(0);
    expect(await prisma.showtimeTierPrice.count({ where: { showtimeId: old.showtimeId } })).toBe(0);
  });

  it('never touches a screening somebody booked, however old', async () => {
    const old = await createShowtime({ startsInMinutes: LONG_AGO });
    const user = await createUser();
    const hold = await prisma.hold.create({
      data: {
        showtimeId: old.showtimeId,
        userId: user.id,
        status: 'CONVERTED',
        seatCount: 1,
        subtotalMinor: old.seatPriceMinor,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await prisma.booking.create({
      data: {
        reference: 'BK-KEEPME',
        showtimeId: old.showtimeId,
        userId: user.id,
        holdId: hold.id,
        status: 'CONFIRMED',
        subtotalMinor: old.seatPriceMinor,
        feeMinor: 0,
        totalMinor: old.seatPriceMinor,
        currency: 'INR',
      },
    });

    const result = await sweepOnce();

    expect(result.spentShowtimesPurged).toBe(0);
    expect(await exists(old)).toBe(true);
    expect(await prisma.booking.count({ where: { reference: 'BK-KEEPME' } })).toBe(1);
  });

  it('keeps a cancelled booking too, so it still shows under past tickets', async () => {
    const old = await createShowtime({ startsInMinutes: LONG_AGO });
    const user = await createUser();
    const hold = await prisma.hold.create({
      data: {
        showtimeId: old.showtimeId,
        userId: user.id,
        status: 'EXPIRED',
        seatCount: 1,
        subtotalMinor: 0,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await prisma.booking.create({
      data: {
        reference: 'BK-CANCEL',
        showtimeId: old.showtimeId,
        userId: user.id,
        holdId: hold.id,
        status: 'CANCELLED',
        subtotalMinor: 0,
        feeMinor: 0,
        totalMinor: 0,
        currency: 'INR',
      },
    });

    await sweepOnce();

    expect(await exists(old)).toBe(true);
  });

  it('leaves a screening that has only just happened', async () => {
    const recent = await createShowtime({ startsInMinutes: YESTERDAY });

    const result = await sweepOnce();

    expect(result.spentShowtimesPurged).toBe(0);
    expect(await exists(recent)).toBe(true);
  });

  it('leaves everything still on sale alone', async () => {
    const future = await createShowtime({ startsInMinutes: 120 });

    await sweepOnce();

    expect(await exists(future)).toBe(true);
    expect(await prisma.showSeat.count({ where: { showtimeId: future.showtimeId } })).toBe(10);
  });

  it('reports nothing to do as zero rather than failing', async () => {
    const result = await sweepOnce();
    expect(result.spentShowtimesPurged).toBe(0);
  });
});
