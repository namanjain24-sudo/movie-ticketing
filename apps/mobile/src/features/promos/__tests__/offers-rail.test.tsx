import type { PromoOffer } from '@app/shared';
import { render } from '../../../test-utils';
import { OffersRail } from '../offers-rail';

const OFFERS: PromoOffer[] = [
  {
    code: 'WELCOME50',
    description: '₹50 off your booking.',
    minSubtotalMinor: 20000,
    expiresAt: null,
  },
  { code: 'OPEN', description: 'No minimum.', minSubtotalMinor: 0, expiresAt: null },
];

describe('OffersRail', () => {
  it('shows every offer with its code and terms', async () => {
    const { getByText } = await render(<OffersRail offers={OFFERS} />);

    expect(getByText('WELCOME50')).toBeTruthy();
    expect(getByText('₹50 off your booking.')).toBeTruthy();
    expect(getByText('OPEN')).toBeTruthy();
  });

  it('names the minimum spend, which checkout used to be the first to mention', async () => {
    const { getByText } = await render(<OffersRail offers={OFFERS} />);
    expect(getByText('Min ₹200')).toBeTruthy();
  });

  it('says nothing about a minimum when the offer has none', async () => {
    const { queryByText } = await render(<OffersRail offers={[OFFERS[1] as PromoOffer]} />);
    expect(queryByText(/^Min /)).toBeNull();
  });

  it('leaves out an offer that has already run out', async () => {
    const expired: PromoOffer = {
      code: 'GONE',
      description: 'Expired yesterday.',
      minSubtotalMinor: 0,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    };
    const { queryByText, getByText } = await render(<OffersRail offers={[expired, ...OFFERS]} />);
    expect(queryByText('GONE')).toBeNull();
    expect(getByText('WELCOME50')).toBeTruthy();
  });

  it('renders nothing when every offer has run out', async () => {
    const expired: PromoOffer = {
      code: 'GONE',
      description: 'Expired yesterday.',
      minSubtotalMinor: 0,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    };
    const { queryByText } = await render(<OffersRail offers={[expired]} />);
    expect(queryByText('Offers')).toBeNull();
  });

  it('flags an offer that is about to go', async () => {
    const soon: PromoOffer = {
      code: 'HURRY',
      description: 'Ending soon.',
      minSubtotalMinor: 0,
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    };
    const { getByText } = await render(<OffersRail offers={[soon]} />);
    expect(getByText('Ends today')).toBeTruthy();
  });

  it('renders nothing when there is nothing on offer', async () => {
    const { queryByText } = await render(<OffersRail offers={[]} />);
    expect(queryByText('Offers')).toBeNull();
  });
});
