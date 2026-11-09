import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { createShowtime, resetDb } from '../../test/helpers';

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
