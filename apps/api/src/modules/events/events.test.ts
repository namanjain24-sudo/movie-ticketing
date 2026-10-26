import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { createEventShow, createShowtime, createUser, resetDb } from '../../test/helpers';

const app = createApp();

/**
 * Matches, concerts, comedy, workshops and theatre.
 *
 * The point of most of these is that adding events did not fork the booking
 * mechanic: a stand at a ground is held, paid for and ticketed by the same
 * code that sells a cinema seat, and the only thing that differs is what the
 * band is called. The tests that matter most are therefore the ones that
 * cross the boundary — a seat map for a fixture, a ticket for a fixture — not
 * the listing.
 */
describe('events catalogue', () => {
  beforeEach(resetDb);

  it('lists a published event with its next show and cheapest band', async () => {
    await createEventShow();

    const res = await request(app).get('/v1/events').expect(200);

    expect(res.body.events).toHaveLength(1);
    const [event] = res.body.events;
    expect(event.kind).toBe('SPORT');
    expect(event.title).toBe('Test Fixture');
    // The cheapest way in anywhere, not the price of the first band listed.
    expect(event.fromPriceMinor).toBe(120_000);
    expect(event.venue.name).toBe('Test Ground');
    expect(event.nextShowAt).toBeTruthy();
    expect(event.cityCount).toBe(1);
  });

  it('keeps an unpublished event out of the catalogue entirely', async () => {
    const draft = await createEventShow({ isPublished: false });

    const list = await request(app).get('/v1/events').expect(200);
    expect(list.body.events).toHaveLength(0);

    // And not reachable by guessing its slug either.
    await request(app).get(`/v1/events/${draft.eventSlug}`).expect(404);
  });

  it('offers only the kinds that actually have something on', async () => {
    await createEventShow({ kind: 'CONCERT' });
    await createEventShow({ kind: 'WORKSHOP' });

    const res = await request(app).get('/v1/events').expect(200);

    expect([...res.body.availableKinds].sort()).toEqual(['CONCERT', 'WORKSHOP']);
  });

  it('filters by kind', async () => {
    await createEventShow({ kind: 'COMEDY' });
    await createEventShow({ kind: 'SPORT' });

    const res = await request(app).get('/v1/events?kind=COMEDY').expect(200);

    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].kind).toBe('COMEDY');
    // The chips still show both, because the chip list is what is on, not
    // what the current filter left.
    expect([...res.body.availableKinds].sort()).toEqual(['COMEDY', 'SPORT']);
  });

  it('filters by the city a show is in, not by a column on the event', async () => {
    await createEventShow({ city: 'Mumbai' });
    await createEventShow({ city: 'Kolkata' });

    const mumbai = await request(app).get('/v1/events?city=Mumbai').expect(200);
    expect(mumbai.body.events).toHaveLength(1);
    expect(mumbai.body.events[0].venue.city).toBe('Mumbai');

    const nowhere = await request(app).get('/v1/events?city=Jaipur').expect(200);
    expect(nowhere.body.events).toHaveLength(0);
  });

  it('does not offer a fixture whose gates have already closed', async () => {
    // Started two hours ago, so `salesCloseAt` is well past.
    await createEventShow({ startsInMinutes: -120 });

    const res = await request(app).get('/v1/events').expect(200);

    // Still listed — a link to it should keep working — but with nothing to
    // sell, which is what a null `nextShowAt` says.
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].nextShowAt).toBeNull();
    expect(res.body.events[0].fromPriceMinor).toBeNull();
  });

  it('finds an event by slug and by id, with its detail fields', async () => {
    const show = await createEventShow();

    const bySlug = await request(app).get(`/v1/events/${show.eventSlug}`).expect(200);
    const byId = await request(app).get(`/v1/events/${show.eventId}`).expect(200);

    expect(bySlug.body.id).toBe(byId.body.id);
    expect(bySlug.body.description).toBeTruthy();
    expect(bySlug.body.highlights).toContain('Gates open two hours before');
    expect(bySlug.body.performers).toEqual(['Home Side', 'Away Side']);
  });

  it('groups an event’s shows by venue, the way a film’s are', async () => {
    const show = await createEventShow();

    const res = await request(app).get(`/v1/events/${show.eventId}/shows`).expect(200);

    expect(res.body.venues).toHaveLength(1);
    const [venue] = res.body.venues;
    expect(venue.cinema.name).toBe('Test Ground');
    expect(venue.cinema.kind).toBe('STADIUM');
    expect(venue.showtimes).toHaveLength(1);
    // The show carries its event, and no film at all.
    expect(venue.showtimes[0].event.title).toBe('Test Fixture');
    expect(venue.showtimes[0].movie).toBeNull();
  });

  it('does not mix a film into an event’s shows', async () => {
    const film = await createShowtime();
    const event = await createEventShow();

    const res = await request(app).get(`/v1/events/${event.eventId}/shows`).expect(200);

    const ids = res.body.venues.flatMap((v: { showtimes: { id: string }[] }) =>
      v.showtimes.map((s) => s.id),
    );
    expect(ids).toContain(event.showtimeId);
    expect(ids).not.toContain(film.showtimeId);
  });
});

describe('a fixture is sold by the same mechanic as a film', () => {
  beforeEach(resetDb);

  it('puts the stand’s real name on the seat map, not the tier’s', async () => {
    const show = await createEventShow();

    const res = await request(app).get(`/v1/showtimes/${show.showtimeId}/seatmap`).expect(200);

    expect(res.body.movie).toBeNull();
    expect(res.body.event.kind).toBe('SPORT');
    const labels = res.body.tiers.map((t: { label: string }) => t.label);
    // "Garware Pavilion", never "VIP" — the tier name is no use at a gate.
    expect(labels).toContain('Garware Pavilion');
    expect(labels).toContain('North Stand');
    expect(labels).not.toContain('VIP');
  });

  it('still labels a cinema’s bands with the generic names', async () => {
    const film = await createShowtime({ tier: 'PREMIUM' });

    const res = await request(app).get(`/v1/showtimes/${film.showtimeId}/seatmap`).expect(200);

    expect(res.body.event).toBeNull();
    expect(res.body.tiers[0].label).toBe('Premium');
  });

  it('holds, pays for and issues a ticket for a seat in a named stand', async () => {
    const user = await createUser();
    const show = await createEventShow();
    const vip = show.seatsByStand['Garware Pavilion']!;

    const hold = await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(user.auth)
      .set('Idempotency-Key', `event-hold-${Date.now()}`)
      .send({ showSeatIds: vip.slice(0, 2) })
      .expect(201);

    expect(hold.body.subtotalMinor).toBe(850_000 * 2);

    const checkout = await request(app)
      .post('/v1/checkout')
      .set(user.auth)
      .set('Idempotency-Key', `event-pay-${Date.now()}`)
      .send({ holdId: hold.body.id, paymentMethod: 'CARD' })
      .expect(201);

    const booking = await prisma.booking.findUnique({
      where: { id: checkout.body.bookingId },
      select: { reference: true },
    });

    const ticket = await request(app)
      .get(`/v1/bookings/reference/${booking!.reference}`)
      .set(user.auth)
      .expect(200);

    expect(ticket.body.showtime.movie).toBeNull();
    expect(ticket.body.showtime.event.title).toBe('Test Fixture');
    // The part somebody reads at a turnstile.
    expect(ticket.body.seats[0].tierLabel).toBe('Garware Pavilion');
    expect(ticket.body.qrPayload).toContain(booking!.reference);
  });

  it('prices each stand separately in one booking', async () => {
    const user = await createUser();
    const show = await createEventShow();

    const hold = await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(user.auth)
      .set('Idempotency-Key', `mixed-${Date.now()}`)
      .send({
        showSeatIds: [
          show.seatsByStand['Garware Pavilion']![0]!,
          show.seatsByStand['North Stand']![0]!,
        ],
      })
      .expect(201);

    // Not two of either, and not an average: each seat costs what its own
    // stand costs.
    expect(hold.body.subtotalMinor).toBe(850_000 + 120_000);
  });

  it('will not sell the same stand seat twice', async () => {
    const [a, b] = [await createUser(), await createUser()];
    const show = await createEventShow();
    const seat = show.seatsByStand['North Stand']![0]!;

    await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(a.auth)
      .set('Idempotency-Key', `first-${Date.now()}`)
      .send({ showSeatIds: [seat] })
      .expect(201);

    const second = await request(app)
      .post(`/v1/showtimes/${show.showtimeId}/holds`)
      .set(b.auth)
      .set('Idempotency-Key', `second-${Date.now()}`)
      .send({ showSeatIds: [seat] })
      .expect(409);

    expect(second.body.error.code).toBe('SEAT_UNAVAILABLE');
  });
});

describe('the venue directory', () => {
  beforeEach(resetDb);

  /**
   * The Cinemas tab is this endpoint. Once events arrived it was handing that
   * tab a cricket ground and a coworking space, each rendered as
   * "1 screen · 1 films on" — three wrong words out of six. Defaulting to
   * cinemas is also the right answer for every APK already on a phone, which
   * calls this and has no idea the other kinds exist.
   */
  it('lists cinemas only, by default', async () => {
    await createShowtime();
    await createEventShow();

    const res = await request(app).get('/v1/cinemas').expect(200);

    expect(res.body.cinemas).toHaveLength(1);
    expect(res.body.cinemas[0].kind).toBe('CINEMA');
    expect(res.body.cinemas.map((c: { name: string }) => c.name)).not.toContain('Test Ground');
  });

  it('returns the whole directory when asked for it', async () => {
    await createShowtime();
    await createEventShow();

    const res = await request(app).get('/v1/cinemas?kind=all').expect(200);

    const kinds = res.body.cinemas.map((c: { kind: string }) => c.kind).sort();
    expect(kinds).toEqual(['CINEMA', 'STADIUM']);
  });

  it('can list one other kind on its own', async () => {
    await createShowtime();
    await createEventShow();

    const res = await request(app).get('/v1/cinemas?kind=STADIUM').expect(200);

    expect(res.body.cinemas).toHaveLength(1);
    expect(res.body.cinemas[0].name).toBe('Test Ground');
  });

  it('still returns a saved ground when it is asked for by id', async () => {
    // A venue someone has saved is shown whatever kind it is; filtering an
    // explicit list of ids would silently drop their own saved ground.
    const event = await createEventShow();

    const res = await request(app).get('/v1/cinemas?kind=all').expect(200);
    expect(res.body.cinemas.map((c: { id: string }) => c.id)).toContain(event.venueId);
  });

  it('counts what is actually on, films or fixtures', async () => {
    const event = await createEventShow();

    const res = await request(app).get('/v1/cinemas?kind=STADIUM').expect(200);

    // One fixture on, not zero — the count used to be films only, which
    // reported a ground with a match on as having nothing.
    expect(res.body.cinemas[0].nowShowingCount).toBe(1);
    void event;
  });
});

describe('the exactly-one-subject rule', () => {
  beforeEach(resetDb);

  /**
   * Enforced by a check constraint rather than by every insert site
   * remembering. These are the two ways to get it wrong, and the database
   * refuses both — which is what makes `movie` and `event` safe to treat as
   * "one of" everywhere above.
   */
  it('refuses a showtime with neither a film nor an event', async () => {
    const film = await createShowtime();
    const screen = await prisma.screen.findFirstOrThrow({ select: { id: true } });
    void film;

    await expect(
      prisma.showtime.create({
        data: {
          screenId: screen.id,
          startsAt: new Date(),
          endsAt: new Date(),
          salesCloseAt: new Date(),
          language: 'Hindi',
        },
      }),
    ).rejects.toThrow();
  });

  it('refuses a showtime with both', async () => {
    const film = await createShowtime();
    const event = await createEventShow();
    const movie = await prisma.movie.findFirstOrThrow({ select: { id: true } });
    const screen = await prisma.screen.findFirstOrThrow({ select: { id: true } });
    void film;

    await expect(
      prisma.showtime.create({
        data: {
          movieId: movie.id,
          eventId: event.eventId,
          screenId: screen.id,
          startsAt: new Date(),
          endsAt: new Date(),
          salesCloseAt: new Date(),
          language: 'Hindi',
        },
      }),
    ).rejects.toThrow();
  });
});
