import { render, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppBar } from '../app-bar';
import { ThemeProvider } from '../../../theme';

// AppBar reads insets directly, so it needs a provider in the tree the same
// way the real app root supplies one — there is no default outside of it.
const metrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 0, height: 0 },
};

const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

describe('AppBar', () => {
  it('renders the title', async () => {
    const { getByText } = await wrap(<AppBar title="Now showing" />);
    expect(getByText('Now showing')).toBeTruthy();
  });

  it('has no back button when onBack is not given', async () => {
    const { queryByLabelText } = await wrap(<AppBar title="Now showing" />);
    expect(queryByLabelText('Go back')).toBeNull();
  });

  it('calls onBack when the back button is pressed', async () => {
    const onBack = jest.fn();
    const { getByLabelText } = await wrap(<AppBar title="Now showing" onBack={onBack} />);

    await userEvent.press(getByLabelText('Go back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('makes the title itself the control when onPressTitle is given, naming the current value', async () => {
    const onPressTitle = jest.fn();
    const { getByLabelText } = await wrap(
      <AppBar title="Mumbai" onPressTitle={onPressTitle} />,
    );

    await userEvent.press(getByLabelText('Change location, currently Mumbai'));

    expect(onPressTitle).toHaveBeenCalledTimes(1);
  });
});
