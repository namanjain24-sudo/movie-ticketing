import type { Booking } from '@app/shared';
import { Share } from 'react-native';
import { BookingCard } from '../booking-card';
import { addShowtimeToCalendar } from '../../../lib/calendar';
import { render, userEvent } from '../../../test-utils';

jest.mock('../../../lib/calendar', () => ({
  addShowtimeToCalendar: jest.fn(async () => 'added'),
}));

jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });

const JAWAN: Booking = {
  id: 'bk_1',
  reference: 'BX1234',
  status: 'CONFIRMED',
  createdAt: '2026-01-01T00:00:00.000Z',
  confirmedAt: '2026-01-01T00:01:00.000Z',
  subtotalMinor: 50_000,
  feeMinor: 3_000,
  addOnsMinor: 0,
  discountMinor: 0,
  promoCode: null,
  totalMinor: 53_000,
  currency: 'INR',
  seats: [{ showSeatId: 'ss_1', rowLabel: 'F', number: 12, tier: 'STANDARD', priceMinor: 25_000 }],
  addOns: [],
  showtime: {
    id: 'st_1',
    startsAt: '2026-02-01T14:30:00.000Z',
    format: 'TWO_D',
    language: 'Hindi',
    movie: { id: 'mv_1', title: 'Jawan', posterUrl: '' },
    cinema: { id: 'cin_1', name: 'PVR ICON', city: 'Mumbai', address: 'Phoenix Palladium' },
    screen: { id: 'scr_1', name: 'Audi 2' },
  },
  qrPayload: 'signed-payload',
};

const booking = (overrides: Partial<Booking> = {}): Booking => ({ ...JAWAN, ...overrides });

describe('BookingCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the film, venue, seats and total', async () => {
    const { getAllByText, getByText } = await render(
      <BookingCard booking={booking()} onPress={jest.fn()} />,
    );

    // The poster itself falls back to the title as text when the image has
    // not loaded, so "Jawan" legitimately appears twice: once there, once as
    // the card's own label.
    expect(getAllByText('Jawan').length).toBeGreaterThan(0);
    expect(getByText('PVR ICON · Audi 2')).toBeTruthy();
    expect(getByText('F12')).toBeTruthy();
  });

  it('opens the ticket when the card is tapped', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await render(<BookingCard booking={booking()} onPress={onPress} />);

    await userEvent.press(getByLabelText(/Jawan, .*Reference BX1234/));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('marks a cancelled booking and does not offer swipe shortcuts', async () => {
    const { getByText, queryByLabelText } = await render(
      <BookingCard booking={booking({ status: 'CANCELLED' })} onPress={jest.fn()} />,
    );

    expect(getByText('CANCELLED')).toBeTruthy();
    expect(queryByLabelText('Calendar')).toBeNull();
    expect(queryByLabelText('Share')).toBeNull();
  });

  it('adds the showtime to the calendar from the swipe action, without opening the ticket', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await render(<BookingCard booking={booking()} onPress={onPress} />);

    await userEvent.press(getByLabelText('Calendar'));

    expect(addShowtimeToCalendar).toHaveBeenCalledWith(booking());
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shares the booking with a deep link back to the ticket', async () => {
    const { getByLabelText } = await render(
      <BookingCard booking={booking()} onPress={jest.fn()} />,
    );

    await userEvent.press(getByLabelText('Share'));

    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('BX1234') }),
    );
    const message = (Share.share as jest.Mock).mock.calls[0][0].message as string;
    expect(message).toMatch(/booking\/BX1234/);
  });
});
