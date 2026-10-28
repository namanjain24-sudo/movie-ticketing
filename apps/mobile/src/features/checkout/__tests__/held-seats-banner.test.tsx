import type { ActiveHold } from '@app/shared';
import { bookingApi } from '../../../api/booking';
import { render, screen, userEvent, waitFor } from '../../../test-utils';
import { HeldSeatsBanner } from '../held-seats-banner';

jest.mock('../../../api/booking', () => ({
  bookingApi: { activeHolds: jest.fn(async () => []) },
}));

const mockAuth = { signedIn: true };
jest.mock('../../auth/auth-provider', () => ({
  useAuth: () => ({ isSignedIn: mockAuth.signedIn, isReady: true, user: null }),
}));

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ router: mockRouter, useRouter: () => mockRouter }));

const activeHolds = bookingApi.activeHolds as jest.Mock;

/** A hold with `mins` left, as the server would report it. */
const hold = (mins: number, overrides: Partial<ActiveHold['hold']> = {}): ActiveHold => {
  const now = new Date('2026-10-28T12:00:00.000Z');
  return {
    hold: {
      id: 'hold_1',
      showtimeId: 'show_1',
      status: 'ACTIVE',
      seats: [
        { id: 's1', rowLabel: 'G', number: 8, tier: 'STANDARD', priceMinor: 30000 },
        { id: 's2', rowLabel: 'G', number: 9, tier: 'STANDARD', priceMinor: 30000 },
      ],
      subtotalMinor: 60000,
      feeMinor: 3000,
      totalMinor: 63000,
      currency: 'INR',
      expiresAt: new Date(now.getTime() + mins * 60_000).toISOString(),
      serverTime: now.toISOString(),
      ...overrides,
    },
    showtime: {
      id: 'show_1',
      startsAt: new Date(now.getTime() + 3 * 3600_000).toISOString(),
      movie: { id: 'm1', slug: 'verity', title: 'Verity', posterUrl: '' },
      event: null,
      cinema: { id: 'c1', name: 'PVR ICON', city: 'Mumbai' },
      screen: { id: 'sc1', name: 'Audi 1' },
    },
  } as ActiveHold;
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-28T12:00:00.000Z'));
  mockAuth.signedIn = true;
  activeHolds.mockReset().mockResolvedValue([]);
  mockRouter.push.mockReset();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('HeldSeatsBanner', () => {
  it('asks for nothing at all when nobody is signed in', async () => {
    mockAuth.signedIn = false;
    await render(<HeldSeatsBanner />);
    // The endpoint needs a session; calling it would 401, and a 401 signs
    // the session out and replaces the screen.
    expect(activeHolds).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says nothing when there is nothing being held', async () => {
    await render(<HeldSeatsBanner />);
    await waitFor(() => expect(activeHolds).toHaveBeenCalled());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names the seats, the film and the time left', async () => {
    activeHolds.mockResolvedValue([hold(4)]);
    await render(<HeldSeatsBanner />);

    expect(await screen.findByText('2 seats held · Verity')).toBeTruthy();
    expect(screen.getByText('G8, G9 · ₹630')).toBeTruthy();
    expect(screen.getByText('4:00')).toBeTruthy();
  });

  it('counts down against the server clock, not the phone', async () => {
    // The hold runs to 12:04 and this phone believes it is 12:00, so left to
    // itself it would promise four minutes. The server says it is already
    // 12:02 — the phone is two minutes slow — and two is the honest answer.
    // Getting this backwards is how an app shows time remaining on a hold the
    // server has already let go of.
    activeHolds.mockResolvedValue([
      hold(4, { serverTime: new Date('2026-10-28T12:02:00.000Z').toISOString() }),
    ]);
    await render(<HeldSeatsBanner />);
    expect(await screen.findByText('2:00')).toBeTruthy();
    expect(screen.queryByText('4:00')).toBeNull();
  });

  it('takes itself away once the hold has run out', async () => {
    activeHolds.mockResolvedValue([hold(1)]);
    await render(<HeldSeatsBanner />);
    expect(await screen.findByText('1:00')).toBeTruthy();

    await jest.advanceTimersByTimeAsync(61_000);

    expect(screen.queryByText(/seats held/)).toBeNull();
  });

  it('goes back to the checkout it came from', async () => {
    activeHolds.mockResolvedValue([hold(3)]);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await render(<HeldSeatsBanner />);

    await user.press(await screen.findByRole('button'));

    expect(mockRouter.push).toHaveBeenCalledWith('/checkout/hold_1');
  });

  it('reads out what it is for', async () => {
    activeHolds.mockResolvedValue([hold(2)]);
    await render(<HeldSeatsBanner />);
    expect(
      await screen.findByLabelText('2 seats held for Verity, 2:00 left. Finish paying.'),
    ).toBeTruthy();
  });
});
