import { Router } from 'express';
import { authenticate, requireUserId } from '../../middleware/authenticate';
import { pathParam } from '../../http/validate';
import * as bookings from './bookings.service';

export const bookingsRouter: Router = Router();

bookingsRouter.use(authenticate);

bookingsRouter.get('/', async (req, res) => {
  res.json(await bookings.listBookings(requireUserId(req)));
});

/** Reference lookup comes first so `/reference/:x` is not read as an id. */
bookingsRouter.get('/reference/:reference', async (req, res) => {
  res.json(
    await bookings.getBookingByReference({
      userId: requireUserId(req),
      reference: pathParam(req, 'reference'),
    }),
  );
});

bookingsRouter.get('/:id', async (req, res) => {
  res.json(await bookings.getBooking({ userId: requireUserId(req), id: pathParam(req, 'id') }));
});

/** Quoted first, so the refund and the retained fee are never a surprise. */
bookingsRouter.get('/:id/cancellation', async (req, res) => {
  res.json(
    await bookings.quoteCancellation({
      userId: requireUserId(req),
      bookingId: pathParam(req, 'id'),
    }),
  );
});

bookingsRouter.post('/:id/cancel', async (req, res) => {
  res.json(
    await bookings.cancelBooking({
      userId: requireUserId(req),
      bookingId: pathParam(req, 'id'),
    }),
  );
});
