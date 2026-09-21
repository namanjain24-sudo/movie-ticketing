import { render, userEvent } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Button } from '../button';
import { ThemeProvider } from '../../../theme';

// Testing Library v14 renders asynchronously, so every call is awaited.
function renderButton(props: Partial<ComponentProps<typeof Button>> = {}) {
  return render(
    <ThemeProvider>
      <Button label="Continue" {...props} />
    </ThemeProvider>,
  );
}

describe('Button', () => {
  it('renders its label', async () => {
    const { getByText } = await renderButton();
    expect(getByText('Continue')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    const { getByRole } = await renderButton({ onPress });

    await userEvent.press(getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('swaps the label for a spinner and blocks presses while loading', async () => {
    const onPress = jest.fn();
    const { queryByText, getByRole } = await renderButton({ onPress, loading: true });

    expect(queryByText('Continue')).toBeNull();
    await userEvent.press(getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    const { getByRole } = await renderButton({ onPress, disabled: true });

    await userEvent.press(getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });
});
