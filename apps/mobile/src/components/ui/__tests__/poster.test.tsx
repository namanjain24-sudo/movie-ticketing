import { render } from '@testing-library/react-native';
import { Poster } from '../poster';
import { ThemeProvider } from '../../../theme';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('Poster', () => {
  it('labels itself for a screen reader with the film title, not a raw image alt', async () => {
    const { getByLabelText } = await wrap(<Poster uri="https://example.com/p.jpg" title="Jawan" />);
    expect(getByLabelText('Jawan poster')).toBeTruthy();
  });

  it('shows initials as the fallback title text', async () => {
    const { getByText } = await wrap(<Poster uri={null} title="Jawan" />);
    expect(getByText('J')).toBeTruthy();
  });

  it('falls back to an em dash when a title has no letters to initialise', async () => {
    const { getByText } = await wrap(<Poster uri={null} title="???" />);
    expect(getByText('—')).toBeTruthy();
  });
});
