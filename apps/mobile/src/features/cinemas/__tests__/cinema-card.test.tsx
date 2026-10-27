import type { CinemaDirectoryEntry } from '@app/shared';
import { CinemaCard } from '../cinema-card';
import { openDirections, callNumber } from '../../../lib/maps';
import { render, userEvent } from '../../../test-utils';

jest.mock('../../../lib/maps', () => ({
  ...jest.requireActual('../../../lib/maps'),
  openDirections: jest.fn(),
  callNumber: jest.fn(),
}));

/**
 * The card mounts `useFavoriteCinemas` to draw its heart, and that hook asks
 * the server which cinemas are pinned. None of these tests are about the
 * heart, but without this the request was real: it went to whatever
 * EXPO_PUBLIC_API_URL named, found nothing listening, and put the client into
 * its wake-a-sleeping-host loop, which went on retrying on a timer long after
 * the test had finished. Nothing failed — the card does not need the answer to
 * render — so it showed up only as "a worker process has failed to exit
 * gracefully" at the end of every full run.
 */
jest.mock('../../../api/favorite-cinemas', () => ({
  favoriteCinemasApi: {
    list: jest.fn(async () => []),
    save: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
  },
}));

const REGAL: CinemaDirectoryEntry = {
  id: 'cin_1',
  kind: 'CINEMA' as const,
  slug: 'regal-cinema-colaba',
  name: 'Regal Cinema, Colaba',
  brand: 'Independent',
  city: 'Mumbai',
  address: 'Shahid Bhagat Singh Road, Colaba Causeway, Mumbai 400039',
  latitude: 18.9227,
  longitude: 72.8329,
  phone: '+91 22 2202 1017',
  amenities: ['Art deco heritage building', 'Balcony seating', 'Dolby Atmos', 'Parking'],
  screenCount: 1,
  nowShowingCount: 4,
  fromPriceMinor: 22_000,
  distanceKm: 3.4,
};

const entry = (overrides: Partial<CinemaDirectoryEntry> = {}): CinemaDirectoryEntry => ({
  ...REGAL,
  ...overrides,
});

describe('CinemaCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the chain, the venue and where it is', async () => {
    const { getByText } = await render(<CinemaCard cinema={entry()} onPress={jest.fn()} />);

    expect(getByText('INDEPENDENT')).toBeTruthy();
    expect(getByText('Regal Cinema, Colaba')).toBeTruthy();
    expect(getByText(REGAL.address)).toBeTruthy();
  });

  it('shows the distance when there is one, and nothing when there is not', async () => {
    const { getByText } = await render(<CinemaCard cinema={entry()} onPress={jest.fn()} />);
    expect(getByText('3.4 km')).toBeTruthy();

    const { queryByText } = await render(
      <CinemaCard cinema={entry({ distanceKm: null })} onPress={jest.fn()} />,
    );
    expect(queryByText('3.4 km')).toBeNull();
  });

  it('caps the facilities and counts the rest rather than wrapping forever', async () => {
    const { getByText, queryByText } = await render(
      <CinemaCard cinema={entry()} onPress={jest.fn()} />,
    );

    expect(getByText('Art deco heritage building')).toBeTruthy();
    expect(queryByText('Parking')).toBeNull();
    expect(getByText('+1')).toBeTruthy();
  });

  it('says plainly when a venue has nothing on', async () => {
    const { getByText } = await render(
      <CinemaCard cinema={entry({ nowShowingCount: 0 })} onPress={jest.fn()} />,
    );
    expect(getByText('1 screen · nothing on')).toBeTruthy();
  });

  it('opens the cinema when the card is tapped', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await render(<CinemaCard cinema={entry()} onPress={onPress} />);

    await userEvent.press(getByLabelText(`Regal Cinema, Colaba, ${REGAL.address}, 3.4 km away`));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // The two icon actions leave the app entirely. Firing the card's own press
  // as well would open the cinema page behind Google Maps.
  it('routes the directions tap to Maps and not to the card', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await render(<CinemaCard cinema={entry()} onPress={onPress} />);

    await userEvent.press(getByLabelText('Directions to Regal Cinema, Colaba'));

    expect(openDirections).toHaveBeenCalledWith({
      latitude: REGAL.latitude,
      longitude: REGAL.longitude,
      label: REGAL.name,
    });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('dials the venue, and offers no call button when there is no number', async () => {
    const { getByLabelText } = await render(<CinemaCard cinema={entry()} onPress={jest.fn()} />);
    await userEvent.press(getByLabelText('Call Regal Cinema, Colaba'));
    expect(callNumber).toHaveBeenCalledWith(REGAL.phone);

    const { queryByLabelText } = await render(
      <CinemaCard cinema={entry({ phone: null })} onPress={jest.fn()} />,
    );
    expect(queryByLabelText('Call Regal Cinema, Colaba')).toBeNull();
  });
});
