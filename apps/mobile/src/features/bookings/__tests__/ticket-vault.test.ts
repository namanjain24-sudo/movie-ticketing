import type { Booking } from '@app/shared';
import { secureStorage } from '../../../lib/storage';
import {
  GATE_GRACE_MINUTES,
  forgetTicket,
  listSavedTickets,
  nextSavedTicketChangeAfter,
  orderSavedTickets,
  readSavedTicket,
  saveTicket,
  toSavedTicket,
  type SavedTicket,
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
      {
        showSeatId: 's1',
        rowLabel: 'H',
        number: 10,
        tier: 'PREMIUM',
        tierLabel: null,
        priceMinor: 45000,
      },
      {
        showSeatId: 's2',
        rowLabel: 'H',
        number: 11,
        tier: 'PREMIUM',
        tierLabel: null,
        priceMinor: 45000,
      },
    ],
    addOns: [],
    showtime: {
      id: 'st_1',
      startsAt: '2026-10-24T12:15:00.000Z',
      format: 'THREE_D',
      language: 'Hindi',
      movie: { id: 'm1', title: 'Drishyam: The Conclusion', posterUrl: 'https://x/poster.jpg' },
      event: null,
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
      tierLabel: null,
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

describe('orderSavedTickets', () => {
  const NOW = Date.parse('2026-11-10T18:00:00.000Z');
  const minutes = (n: number) => n * 60_000;

  function saved(reference: string, startsAt: string): SavedTicket {
    return {
      reference,
      status: 'CONFIRMED',
      qrPayload: `qr-${reference}`,
      movieTitle: 'Jawan',
      cinema: 'PVR Phoenix, Mumbai',
      screen: 'Audi 3',
      startsAt,
      format: 'TWO_D',
      language: 'Hindi',
      seats: 'H10, H11',
      totalMinor: 90000,
      currency: 'INR',
      savedAt: '2026-11-01T00:00:00.000Z',
    };
  }

  const at = (offsetMinutes: number) => new Date(NOW + minutes(offsetMinutes)).toISOString();

  it('puts the soonest show first, whatever order it was saved in', () => {
    const { live } = orderSavedTickets(
      [saved('BK-LATE', at(600)), saved('BK-NEXT', at(30)), saved('BK-MID', at(180))],
      NOW,
    );

    expect(live.map((t) => t.reference)).toEqual(['BK-NEXT', 'BK-MID', 'BK-LATE']);
  });

  it('keeps a show that has only just started at the top', () => {
    // Somebody arriving during the trailers still needs this one scanned.
    const { live, past } = orderSavedTickets(
      [saved('BK-TONIGHT', at(90)), saved('BK-STARTED', at(-20))],
      NOW,
    );

    expect(live.map((t) => t.reference)).toEqual(['BK-STARTED', 'BK-TONIGHT']);
    expect(past).toEqual([]);
  });

  it('files a show as past once the grace window has run out', () => {
    const { live, past } = orderSavedTickets(
      [saved('BK-OVER', at(-(GATE_GRACE_MINUTES + 1)))],
      NOW,
    );

    expect(live).toEqual([]);
    expect(past.map((t) => t.reference)).toEqual(['BK-OVER']);
  });

  it('treats the far edge of the grace window as still live', () => {
    const { live } = orderSavedTickets([saved('BK-EDGE', at(-GATE_GRACE_MINUTES))], NOW);

    expect(live.map((t) => t.reference)).toEqual(['BK-EDGE']);
  });

  it('orders the past pile newest first, so the last film watched is on top', () => {
    const { past } = orderSavedTickets(
      [saved('BK-OLD', at(-60 * 24 * 30)), saved('BK-RECENT', at(-60 * 24))],
      NOW,
    );

    expect(past.map((t) => t.reference)).toEqual(['BK-RECENT', 'BK-OLD']);
  });

  it('keeps a ticket whose date will not parse, at the end of the live ones', () => {
    const { live, past } = orderSavedTickets(
      [saved('BK-BROKEN', 'not a date'), saved('BK-FINE', at(45))],
      NOW,
    );

    // Never hidden in the past pile: an unreadable date is not evidence the
    // show is over, and this list exists to produce a ticket.
    expect(live.map((t) => t.reference)).toEqual(['BK-FINE', 'BK-BROKEN']);
    expect(past).toEqual([]);
  });

  it('does not reorder or mutate what it was given', () => {
    const tickets = [saved('BK-LATE', at(600)), saved('BK-NEXT', at(30))];

    orderSavedTickets(tickets, NOW);

    expect(tickets.map((t) => t.reference)).toEqual(['BK-LATE', 'BK-NEXT']);
  });

  it('has nothing to say about an empty vault', () => {
    expect(orderSavedTickets([], NOW)).toEqual({ live: [], past: [] });
  });

  describe('nextSavedTicketChangeAfter', () => {
    it('wakes when the earliest show leaves the grace window', () => {
      expect(
        nextSavedTicketChangeAfter([saved('BK-A', at(90)), saved('BK-B', at(30))], NOW),
      ).toEqual(NOW + minutes(30 + GATE_GRACE_MINUTES));
    });

    it('skips a show whose window has already closed', () => {
      expect(
        nextSavedTicketChangeAfter([saved('BK-OVER', at(-500)), saved('BK-NEXT', at(10))], NOW),
      ).toEqual(NOW + minutes(10 + GATE_GRACE_MINUTES));
    });

    it('answers null when every ticket is already past, so no timer is held', () => {
      expect(nextSavedTicketChangeAfter([saved('BK-OVER', at(-500))], NOW)).toBeNull();
    });

    it('answers null for an unparseable date rather than waking on NaN', () => {
      expect(nextSavedTicketChangeAfter([saved('BK-BROKEN', 'not a date')], NOW)).toBeNull();
    });

    it('answers null for an empty vault', () => {
      expect(nextSavedTicketChangeAfter([], NOW)).toBeNull();
    });
  });
});
