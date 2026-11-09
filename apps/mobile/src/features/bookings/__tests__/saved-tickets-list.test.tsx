import { SavedTicketsList } from '../saved-tickets-list';
import type { SavedTicket } from '../ticket-vault';
import { render } from '../../../test-utils';

/** `mock`-prefixed so the factory below may close over it. */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

/** A Friday evening, so "tonight" and "last month" both mean something. */
const NOW = Date.parse('2026-11-13T13:00:00.000Z');
const LAST_MONTH = -60 * 24 * 30;

function saved(reference: string, startsAtOffsetMinutes: number, title: string): SavedTicket {
  return {
    reference,
    status: 'CONFIRMED',
    qrPayload: `qr-${reference}`,
    movieTitle: title,
    cinema: 'PVR Phoenix, Mumbai',
    screen: 'Audi 3',
    startsAt: new Date(NOW + startsAtOffsetMinutes * 60_000).toISOString(),
    format: 'TWO_D',
    language: 'Hindi',
    seats: 'H10, H11',
    totalMinor: 90_000,
    currency: 'INR',
    savedAt: '2026-11-01T00:00:00.000Z',
  };
}

const noop = () => {};

const list = (tickets: SavedTicket[]) => (
  <SavedTicketsList tickets={tickets} onRetry={noop} retrying={false} />
);

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * What a phone with no signal in a cinema foyer actually shows.
 *
 * The ordering itself is covered against `orderSavedTickets`; this is here
 * because the bug was never in the ordering — it was that the screen asked the
 * vault for its storage order and rendered that. Only a render catches a
 * screen that stops calling the sorter.
 */
describe('SavedTicketsList', () => {
  it('shows the show starting soonest above the one already watched', async () => {
    const { getAllByText } = await render(
      list([saved('BK-LASTMONTH', LAST_MONTH, 'Animal'), saved('BK-TONIGHT', 40, 'Jawan')]),
    );

    expect(getAllByText(/^(Jawan|Animal)$/).map((node) => node.props.children)).toEqual([
      'Jawan',
      'Animal',
    ]);
  });

  it('separates the spent tickets under a heading instead of mixing them in', async () => {
    const { getByText } = await render(
      list([saved('BK-TONIGHT', 40, 'Jawan'), saved('BK-LASTMONTH', LAST_MONTH, 'Animal')]),
    );

    expect(getByText('ALREADY WATCHED')).toBeTruthy();
  });

  it('says nothing about history when every ticket is still live', async () => {
    const { queryByText } = await render(list([saved('BK-TONIGHT', 40, 'Jawan')]));

    expect(queryByText('ALREADY WATCHED')).toBeNull();
  });

  it('counts down a live ticket and leaves a spent one uncounted', async () => {
    const { getByText, queryByText } = await render(
      list([saved('BK-TONIGHT', 40, 'Jawan'), saved('BK-LASTMONTH', LAST_MONTH, 'Animal')]),
    );

    expect(getByText('in 40m')).toBeTruthy();
    expect(queryByText(/started/)).toBeNull();
  });

  it('still counts a show whose trailers have started, rather than filing it away', async () => {
    const { getByText, queryByText } = await render(list([saved('BK-NOW', -20, 'Jawan')]));

    expect(getByText('started 20m ago')).toBeTruthy();
    expect(queryByText('ALREADY WATCHED')).toBeNull();
  });

  it('puts the countdown in the label a screen reader hears', async () => {
    const { getByLabelText } = await render(list([saved('BK-TONIGHT', 40, 'Jawan')]));

    expect(getByLabelText('Jawan, H10, H11, booking BK-TONIGHT, in 40m')).toBeTruthy();
  });

  it('leaves the countdown out of a spent ticket’s label', async () => {
    const { getByLabelText } = await render(list([saved('BK-OLD', LAST_MONTH, 'Animal')]));

    expect(getByLabelText('Animal, H10, H11, booking BK-OLD')).toBeTruthy();
  });

  it('still says these are only the tickets this phone kept', async () => {
    const { getByText } = await render(list([saved('BK-TONIGHT', 40, 'Jawan')]));

    expect(getByText(/tickets this phone kept/)).toBeTruthy();
  });
});
