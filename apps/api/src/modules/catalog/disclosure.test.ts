import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { createShowtime, createUser, idempotencyKey, resetDb, waitFor } from '../../test/helpers';

const app = createApp();

/**
 * Whether somebody can follow a film, said before they pay for it.
 *
 * The Ministry of Information and Broadcasting's advisory of July 2026, after
 * a Delhi High Court order that February, requires a ticketing platform to
 * disclose audio description, closed captions and Indian Sign Language before
 * a booking is completed — and to name the application where an external one
 * delivers them. Audio description in a multiplex here is streamed to the
 * viewer's own handset, so the name of the app is the difference between a
 * disclosure and a usable screening.
 *
 * The features reached the showtime listing and stopped there. The seat map —
 * the page somebody actually books on, and the only one they see after
 * choosing a time — did not carry them at all.
 */
describe('accessibility disclosure', () => {
  beforeEach(resetDb);

  async function describedShowtime() {
    const made = await createShowtime();
    await prisma.showtime.update({
      where: { id: made.showtimeId },
      data: {
        accessibility: ['AUDIO_DESCRIPTION', 'CLOSED_CAPTIONS'],
        accessibilityVia: 'XL Cinema',
      },
    });
    return made;
  }

  it('carries the features and the app onto the seat map', async () => {
    const made = await describedShowtime();

    const res = await request(app).get(`/v1/showtimes/${made.showtimeId}/seatmap`).expect(200);

    expect(res.body.accessibility).toEqual(['AUDIO_DESCRIPTION', 'CLOSED_CAPTIONS']);
    expect(res.body.accessibilityVia).toBe('XL Cinema');
  });

  it('carries them in the listing as well, so the chip and the page agree', async () => {
    const made = await describedShowtime();

    const res = await request(app)
      .get('/v1/showtimes')
      .query({ movieId: made.movieId })
      .expect(200);

    const slot = res.body.cinemas
      .flatMap((c: { showtimes: unknown[] }) => c.showtimes)
      .find((s: { id: string }) => s.id === made.showtimeId);

    expect(slot.accessibility).toEqual(['AUDIO_DESCRIPTION', 'CLOSED_CAPTIONS']);
    expect(slot.accessibilityVia).toBe('XL Cinema');
  });

  it('claims nothing for an ordinary screening', async () => {
    // Empty and null, not absent: "nothing is claimed" is a real answer and
    // has to survive the trip, because the app renders nothing for it rather
    // than asserting the screening has no accessibility at all.
    const made = await createShowtime();

    const res = await request(app).get(`/v1/showtimes/${made.showtimeId}/seatmap`).expect(200);

    expect(res.body.accessibility).toEqual([]);
    expect(res.body.accessibilityVia).toBeNull();
  });

  it('leaves the app null for a captioned show, which needs nothing installed', async () => {
    const made = await createShowtime();
    await prisma.showtime.update({
      where: { id: made.showtimeId },
      data: { accessibility: ['CLOSED_CAPTIONS'] },
    });

    const res = await request(app).get(`/v1/showtimes/${made.showtimeId}/seatmap`).expect(200);

    expect(res.body.accessibility).toEqual(['CLOSED_CAPTIONS']);
    expect(res.body.accessibilityVia).toBeNull();
  });
});

/**
 * When the film starts, as opposed to when the advertising does.
 *
 * A Bengaluru consumer commission fined PVR and INOX a lakh over twenty-five
 * minutes of commercials and directed that tickets carry the actual start of
 * the film; Hyderabad and Telangana benches have since called the same delay
 * a deficiency in service. The catalogue already knew the gap - `endsAt` has
 * always been the runtime plus the ads - and nothing ever sent it.
 */
describe('advertising disclosure', () => {
  beforeEach(resetDb);

  it('sends the figure with the seat map', async () => {
    const made = await createShowtime();
    await prisma.showtime.update({
      where: { id: made.showtimeId },
      data: { adsMinutes: 20 },
    });

    const res = await request(app).get(`/v1/showtimes/${made.showtimeId}/seatmap`).expect(200);

    expect(res.body.adsMinutes).toBe(20);
  });

  it('sends it in the listing too', async () => {
    const made = await createShowtime();
    await prisma.showtime.update({ where: { id: made.showtimeId }, data: { adsMinutes: 20 } });

    const res = await request(app)
      .get('/v1/showtimes')
      .query({ movieId: made.movieId })
      .expect(200);

    const slot = res.body.cinemas
      .flatMap((c: { showtimes: unknown[] }) => c.showtimes)
      .find((s: { id: string }) => s.id === made.showtimeId);

    expect(slot.adsMinutes).toBe(20);
  });

  it('defaults to none, which is the honest answer for a row nobody measured', async () => {
    const made = await createShowtime();

    const res = await request(app).get(`/v1/showtimes/${made.showtimeId}/seatmap`).expect(200);

    expect(res.body.adsMinutes).toBe(0);
  });
});

/**
 * The ticket itself, which is what the Bengaluru order was actually about:
 * the bench directed that tickets carry the start of the film rather than
 * the start of the advertising. A figure that reaches the seat map and stops
 * there would miss the one document the ruling names.
 */
describe('advertising disclosure on the ticket', () => {
  beforeEach(resetDb);

  it('reaches the booking a person opens at the gate', async () => {
    const show = await createShowtime({ seatCount: 4, startsInMinutes: 600 });
    await prisma.showtime.update({ where: { id: show.showtimeId }, data: { adsMinutes: 20 } });
    const alice = await createUser('alice');

    const hold = await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(alice.auth)
      .set('Idempotency-Key', idempotencyKey())
      .send({ showSeatIds: [show.showSeatIds[0]] })
      .expect(201);

    const checkout = await request(app)
      .post('/v1/checkout')
      .set(alice.auth)
      .set('Idempotency-Key', idempotencyKey())
      .send({ holdId: hold.body.id })
      .expect(201);

    await waitFor(async () => {
      const booking = await prisma.booking.findUnique({
        where: { id: checkout.body.bookingId },
        select: { status: true },
      });
      return booking?.status === 'CONFIRMED';
    });

    const ticket = await request(app)
      .get(`/v1/bookings/${checkout.body.bookingId}`)
      .set(alice.auth)
      .expect(200);

    expect(ticket.body.showtime.adsMinutes).toBe(20);
  });
});
