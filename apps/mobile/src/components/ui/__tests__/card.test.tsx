import { render } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';
import { Card } from '../card';
import { ThemeProvider } from '../../../theme';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('Card', () => {
  it('renders its children', async () => {
    const { getByText } = await wrap(
      <Card>
        <RNText>Inside the card</RNText>
      </Card>,
    );
    expect(getByText('Inside the card')).toBeTruthy();
  });

  it('pads by default, and drops padding when a card owns its own layout', async () => {
    const padded = await wrap(
      <Card>
        <RNText>a</RNText>
      </Card>,
    );
    const flat = padded.getByText('a').parent?.props.style;
    expect(Array.isArray(flat) ? flat.flat() : [flat]).toEqual(
      expect.arrayContaining([expect.objectContaining({ padding: expect.any(Number) })]),
    );

    const unpadded = await wrap(
      <Card padded={false}>
        <RNText>b</RNText>
      </Card>,
    );
    const flatUnpadded = unpadded.getByText('b').parent?.props.style;
    const merged = (Array.isArray(flatUnpadded) ? flatUnpadded.flat() : [flatUnpadded]).find(
      (s) => s && typeof s === 'object' && 'padding' in s,
    );
    expect(merged?.padding).toBe(0);
  });
});
