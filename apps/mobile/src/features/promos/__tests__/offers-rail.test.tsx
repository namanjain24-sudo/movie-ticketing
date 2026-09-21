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

  it('renders nothing when there is nothing on offer', async () => {
    const { queryByText } = await render(<OffersRail offers={[]} />);
    expect(queryByText('Offers')).toBeNull();
  });
});
