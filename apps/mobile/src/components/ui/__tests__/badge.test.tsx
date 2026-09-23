import { render } from '@testing-library/react-native';
import { Badge } from '../badge';
import { ThemeProvider } from '../../../theme';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('Badge', () => {
  it('uppercases its label', async () => {
    const { getByText } = await wrap(<Badge label="sold out" />);
    expect(getByText('SOLD OUT')).toBeTruthy();
  });

  it('renders the neutral tone', async () => {
    const { getByText } = await wrap(<Badge label="neutral" tone="neutral" />);
    expect(getByText('NEUTRAL')).toBeTruthy();
  });

  it('renders the primary tone', async () => {
    const { getByText } = await wrap(<Badge label="primary" tone="primary" />);
    expect(getByText('PRIMARY')).toBeTruthy();
  });

  it('renders the success tone', async () => {
    const { getByText } = await wrap(<Badge label="success" tone="success" />);
    expect(getByText('SUCCESS')).toBeTruthy();
  });

  it('renders the warning tone', async () => {
    const { getByText } = await wrap(<Badge label="warning" tone="warning" />);
    expect(getByText('WARNING')).toBeTruthy();
  });

  it('renders the onImage tone, for a badge sat on artwork', async () => {
    const { getByText } = await wrap(<Badge label="hd" tone="onImage" />);
    expect(getByText('HD')).toBeTruthy();
  });

  it('renders the outline variant', async () => {
    const { getByText } = await wrap(<Badge label="filling" variant="outline" />);
    expect(getByText('FILLING')).toBeTruthy();
  });
});
