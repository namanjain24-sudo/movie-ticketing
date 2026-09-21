import type { PromoOffer, PromoQuote } from '@app/shared';
import { fireEvent, render, userEvent } from '../../../test-utils';
import { PromoBox } from '../promo-box';

const OFFERS: PromoOffer[] = [
  {
    code: 'WELCOME50',
    description: '₹50 off your booking.',
    minSubtotalMinor: 20000,
    expiresAt: null,
  },
  { code: 'MOVIE20', description: '20% off seats.', minSubtotalMinor: 30000, expiresAt: null },
];

const APPLIED: PromoQuote = {
  code: 'WELCOME50',
  description: '₹50 off',
  subtotalMinor: 60000,
  feeMinor: 3000,
  discountMinor: 5000,
  totalMinor: 58000,
  currency: 'INR',
};

async function setup(props: Partial<React.ComponentProps<typeof PromoBox>> = {}) {
  const onApply = jest.fn();
  const onRemove = jest.fn();
  const utils = await render(
    <PromoBox
      offers={OFFERS}
      applied={null}
      busy={false}
      error={null}
      locked={false}
      onApply={onApply}
      onRemove={onRemove}
      {...props}
    />,
  );
  return { onApply, onRemove, ...utils };
}

describe('PromoBox', () => {
  it('applies what was typed, trimmed', async () => {
    const { getByLabelText, getByText, onApply } = await setup();

    await fireEvent.changeText(getByLabelText('Promo code'), '  movie20 ');
    await userEvent.press(getByText('Apply'));

    expect(onApply).toHaveBeenCalledWith('movie20');
  });

  it('will not apply an empty box', async () => {
    const { getByText, onApply } = await setup();

    await userEvent.press(getByText('Apply'));

    expect(onApply).not.toHaveBeenCalled();
  });

  it('applies an advertised offer in one tap', async () => {
    const { getByLabelText, onApply } = await setup();

    await userEvent.press(getByLabelText(/Use code MOVIE20/));

    expect(onApply).toHaveBeenCalledWith('MOVIE20');
  });

  it('says why a code was refused', async () => {
    const { getByText } = await setup({ error: 'That code has expired' });
    expect(getByText('That code has expired')).toBeTruthy();
  });

  it('shows the saving once applied, and lets the user take it off', async () => {
    const { getByText, getByLabelText, onRemove } = await setup({ applied: APPLIED });

    expect(getByText('WELCOME50 applied')).toBeTruthy();
    expect(getByText(/You save/)).toBeTruthy();

    await userEvent.press(getByLabelText('Remove code WELCOME50'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('cannot be changed once a payment has started', async () => {
    const { queryByLabelText, getByText } = await setup({ applied: APPLIED, locked: true });

    expect(getByText('WELCOME50 applied')).toBeTruthy();
    expect(queryByLabelText('Remove code WELCOME50')).toBeNull();
  });

  it('shows nothing at all when locked without a code', async () => {
    const { queryByText } = await setup({ locked: true });
    expect(queryByText('Promo code')).toBeNull();
  });
});
