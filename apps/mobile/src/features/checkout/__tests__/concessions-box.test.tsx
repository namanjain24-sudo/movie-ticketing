import type { ConcessionItem } from '@app/shared';
import { render } from '../../../test-utils';
import { ConcessionsBox } from '../concessions-box';

const ITEMS: ConcessionItem[] = [
  {
    id: 'water',
    name: 'Packaged drinking water',
    description: '500ml, sealed.',
    priceMinor: 4_000,
  } as ConcessionItem,
  {
    id: 'popcorn',
    name: 'Salted popcorn',
    description: 'Large tub.',
    priceMinor: 32_000,
  } as ConcessionItem,
];

/** The entitlement's opening words, which is what the assertions match on. */
const WATER_NOTE = /free drinking water/i;

describe('ConcessionsBox', () => {
  it('offers what the cinema sells', async () => {
    const { getByText } = await render(
      <ConcessionsBox items={ITEMS} quantities={{}} locked={false} onChange={jest.fn()} />,
    );
    expect(getByText('Packaged drinking water')).toBeTruthy();
    expect(getByText('Salted popcorn')).toBeTruthy();
  });

  it('says free drinking water is a right, next to the bottle it charges for', async () => {
    // The Supreme Court required it in 2023 and almost nobody knows. Under a
    // 500ml bottle priced at ₹40 is where saying so is worth something.
    const { getByText } = await render(
      <ConcessionsBox items={ITEMS} quantities={{}} locked={false} onChange={jest.fn()} />,
    );
    expect(getByText(WATER_NOTE)).toBeTruthy();
  });

  it('drops the note once the order is locked, because that is a receipt', async () => {
    const { queryByText } = await render(
      <ConcessionsBox items={ITEMS} quantities={{ popcorn: 1 }} locked onChange={jest.fn()} />,
    );
    // Still a receipt of what was ordered...
    expect(queryByText('Salted popcorn')).toBeTruthy();
    // ...but no longer a place to say what could have been had instead.
    expect(queryByText(WATER_NOTE)).toBeNull();
  });

  it('shows only what was ordered once locked', async () => {
    const { queryByText } = await render(
      <ConcessionsBox items={ITEMS} quantities={{ popcorn: 1 }} locked onChange={jest.fn()} />,
    );
    expect(queryByText('Packaged drinking water')).toBeNull();
  });

  it('renders nothing when the cinema sells nothing', async () => {
    const { queryByText } = await render(
      <ConcessionsBox items={[]} quantities={{}} locked={false} onChange={jest.fn()} />,
    );
    expect(queryByText('Popcorn & drinks')).toBeNull();
    expect(queryByText(WATER_NOTE)).toBeNull();
  });

  it('renders nothing when locked with nothing ordered', async () => {
    const { queryByText } = await render(
      <ConcessionsBox items={ITEMS} quantities={{}} locked onChange={jest.fn()} />,
    );
    expect(queryByText('Popcorn & drinks')).toBeNull();
  });
});
