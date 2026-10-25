import type { Booking } from '@app/shared';
import { secureStorage } from '../../../lib/storage';
import {
  forgetTicket,
  listSavedTickets,
  readSavedTicket,
  saveTicket,
  toSavedTicket,
} from '../ticket-vault';

/** `mock`-prefixed so the factory below may close over it. */
const mockStore = new Map<string, string>();

jest.mock('../../../lib/storage', () => ({
  STORAGE_KEYS: { savedTicketIndex: 'tickets.index', savedTicketPrefix: 'tickets.saved.' },
  secureStorage: {
    get: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
    remove: jest.fn(async (k: string) => void mockStore.delete(k)),
  },
}));

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'bk_1',
    reference: 'BK-AAA111',
    status: 'CONFIRMED',
    createdAt: '2026-10-24T10:00:00.000Z',
    confirmedAt: '2026-10-24T10:00:01.000Z',
    subtotalMinor: 90000,
    feeMinor: 3000,
    addOnsMinor: 0,
    discountMinor: 0,
    promoCode: null,
    pointsRedeemed: 0,
    pointsEarned: 9,
    totalMinor: 93000,
    currency: 'INR',
    seats: [
      { showSeatId: 's1', rowLabel: 'H', number: 10, tier: 'PREMIUM', priceMinor: 45000 },
      { showSeatId: 's2', rowLabel: 'H', number: 11, tier: 'PREMIUM', priceMinor: 45000 },
    ],
    addOns: [],
    showtime: {
      id: 'st_1',
      startsAt: '2026-10-24T12:15:00.000Z',
      format: 'THREE_D',
      language: 'Hindi',
      movie: { id: 'm1', title: 'Drishyam: The Conclusion', posterUrl: 'https://x/poster.jpg' },
      cinema: {
        id: 'c1',
        name: 'AMB Cinemas, Gachibowli',
        city: 'Hyderabad',
        address: 'Sarath City Capital Mall, Gachibowli, Hyderabad 500032',
      },
      screen: { id: 'sc1', name: 'Audi 1' },
    },
    qrPayload: 'BK-AAA111|st_1|2|Zm9vYmFyYmF6cXV4MTIzNDU2',
    ...overrides,
  } as Booking;
}

beforeEach(() => mockStore.clear());

describe('ticket vault', () => {
  it('gives back the ticket a gate actually needs', async () => {
    await saveTicket(booking());
    const saved = await readSavedTicket('BK-AAA111');

    expect(saved).toMatchObject({
      reference: 'BK-AAA111',
      qrPayload: 'BK-AAA111|st_1|2|Zm9vYmFyYmF6cXV4MTIzNDU2',
      movieTitle: 'Drishyam: The Conclusion',
      cinema: 'AMB Cinemas, Gachibowli, Hyderabad',
      screen: 'Audi 1',
      seats: 'H10, H11',
      totalMinor: 93000,
    });
    expect(saved?.savedAt).toBeTruthy();
  });

  it('has nothing to say about a reference it never saw', async () => {
    expect(await readSavedTicket('BK-NOPE00')).toBeNull();
  });

  /**
   * The reason this is one key per ticket, and a projection rather than the
   * API's payload. A real ten-seat booking from the API is already over two
   * kilobytes before any list wraps it, and Expo warns that some iOS releases
   * have historically refused values around that size. Bounded is the point.
   */
  it('stays under a kilobyte even at ten seats', async () => {
    const seats = Array.from({ length: 10 }, (_, i) => ({
      showSeatId: `s${i}`,
      rowLabel: 'H',
      number: i + 1,
      tier: 'PREMIUM' as const,
      priceMinor: 45000,
    }));
    await saveTicket(booking({ seats, reference: 'BK-BIG001' }));

    const raw = mockStore.get('tickets.saved.BK-BIG001')!;
    expect(Buffer.byteLength(raw)).toBeLessThan(1024);
  });

  it('keeps a pending or failed booking out of the vault entirely', async () => {
    await saveTicket(booking({ status: 'PENDING', reference: 'BK-PEND01' }));
    await saveTicket(booking({ status: 'FAILED', reference: 'BK-FAIL01' }));

    expect(await readSavedTicket('BK-PEND01')).toBeNull();
    expect(await readSavedTicket('BK-FAIL01')).toBeNull();
  });

  it('drops the oldest once a thirteenth ticket arrives', async () => {
    // Sequentially, because which one gets evicted depends on the order.
    for (let i = 0; i < 13; i += 1) {
      await saveTicket(booking({ reference: `BK-00000${i}` }));
    }

    // The first one saved is the one that goes.
    expect(await readSavedTicket('BK-000000')).toBeNull();
    expect(await readSavedTicket('BK-000001')).not.toBeNull();
    expect(await readSavedTicket('BK-0000012')).not.toBeNull();
    expect(JSON.parse(mockStore.get('tickets.index')!)).toHaveLength(12);
  });

  it('re-saving a ticket does not push it out of its own index', async () => {
    await saveTicket(booking({ reference: 'BK-SAME01' }));
    await saveTicket(booking({ reference: 'BK-SAME01' }));

    expect(JSON.parse(mockStore.get('tickets.index')!)).toEqual(['BK-SAME01']);
  });

  it('forgets a cancelled ticket, entry and index together', async () => {
    await saveTicket(booking());
    await forgetTicket('BK-AAA111');

    expect(await readSavedTicket('BK-AAA111')).toBeNull();
    expect(JSON.parse(mockStore.get('tickets.index')!)).toEqual([]);
  });

  it('refuses a stored copy that is missing what the screen needs', async () => {
    mockStore.set('tickets.saved.BK-OLD001', JSON.stringify({ reference: 'BK-OLD001' }));
    expect(await readSavedTicket('BK-OLD001')).toBeNull();

    mockStore.set('tickets.saved.BK-JUNK01', 'not json at all');
    expect(await readSavedTicket('BK-JUNK01')).toBeNull();
  });

  it('never throws when the keychain refuses to write', async () => {
    (secureStorage.set as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));
    await expect(saveTicket(booking())).resolves.toBeUndefined();
  });

  it('formats seats the way the stub prints them', () => {
    expect(toSavedTicket(booking()).seats).toBe('H10, H11');
  });
});

describe('listing what this phone kept', () => {
  /**
   * The gap airplane mode on a real device exposed: the saved ticket was
   * reachable only by its own URL, and the one route to that URL is the
   * bookings list, which needs the network.
   */
  it('gives back every saved ticket, newest first', async () => {
    await saveTicket(booking({ reference: 'BK-OLD001' }));
    await saveTicket(booking({ reference: 'BK-MID001' }));
    await saveTicket(booking({ reference: 'BK-NEW001' }));

    const tickets = await listSavedTickets();

    expect(tickets.map((t) => t.reference)).toEqual(['BK-NEW001', 'BK-MID001', 'BK-OLD001']);
  });

  it('is empty rather than broken when nothing has been saved', async () => {
    expect(await listSavedTickets()).toEqual([]);
  });

  it('skips an entry the index names but storage has lost', async () => {
    await saveTicket(booking({ reference: 'BK-KEPT01' }));
    await saveTicket(booking({ reference: 'BK-GONE01' }));
    mockStore.delete('tickets.saved.BK-GONE01');

    const tickets = await listSavedTickets();

    expect(tickets.map((t) => t.reference)).toEqual(['BK-KEPT01']);
  });

  it('does not list a ticket that was forgotten', async () => {
    await saveTicket(booking({ reference: 'BK-KEPT01' }));
    await saveTicket(booking({ reference: 'BK-DROP01' }));
    await forgetTicket('BK-DROP01');

    expect((await listSavedTickets()).map((t) => t.reference)).toEqual(['BK-KEPT01']);
  });
});
