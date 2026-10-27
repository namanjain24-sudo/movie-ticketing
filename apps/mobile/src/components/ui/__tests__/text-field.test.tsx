import { render, userEvent } from '@testing-library/react-native';
import { TextField } from '../text-field';
import { ThemeProvider } from '../../../theme';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('TextField', () => {
  it('exposes the visible label as the accessible label, for a screen reader', async () => {
    const { getByLabelText } = await wrap(
      <TextField label="Email" value="" onChangeText={jest.fn()} />,
    );
    expect(getByLabelText('Email')).toBeTruthy();
  });

  it('reports typed input', async () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = await wrap(
      <TextField label="Email" value="" onChangeText={onChangeText} />,
    );

    await userEvent.type(getByLabelText('Email'), 'a@b.com');

    expect(onChangeText).toHaveBeenCalled();
  });

  it('shows the error instead of the hint, since only one fits', async () => {
    const { getByText, queryByText } = await wrap(
      <TextField
        label="Password"
        value=""
        onChangeText={jest.fn()}
        hint="At least 10 characters"
        error="Too short"
      />,
    );

    expect(getByText('Too short')).toBeTruthy();
    expect(queryByText('At least 10 characters')).toBeNull();
  });

  it('falls back to the hint when there is no error', async () => {
    const { getByText } = await wrap(
      <TextField
        label="Password"
        value=""
        onChangeText={jest.fn()}
        hint="At least 10 characters"
      />,
    );
    expect(getByText('At least 10 characters')).toBeTruthy();
  });

  describe('password reveal', () => {
    it('offers no toggle on an ordinary field', async () => {
      const { queryByLabelText } = await wrap(
        <TextField label="Email" value="" onChangeText={jest.fn()} />,
      );
      expect(queryByLabelText('Show password')).toBeNull();
    });

    it('starts masked, and says it can be shown', async () => {
      const { getByLabelText } = await wrap(
        <TextField label="Password" value="hunter2" onChangeText={jest.fn()} secureTextEntry />,
      );
      expect(getByLabelText('Password').props.secureTextEntry).toBe(true);
      expect(getByLabelText('Show password')).toBeTruthy();
    });

    it('unmasks when the toggle is pressed, and masks again', async () => {
      const user = userEvent.setup();
      const { getByLabelText } = await wrap(
        <TextField label="Password" value="hunter2" onChangeText={jest.fn()} secureTextEntry />,
      );

      await user.press(getByLabelText('Show password'));
      expect(getByLabelText('Password').props.secureTextEntry).toBe(false);

      // The label flips too, so a screen reader is told what the button does
      // now rather than what it did a moment ago.
      await user.press(getByLabelText('Hide password'));
      expect(getByLabelText('Password').props.secureTextEntry).toBe(true);
    });

    it('keeps the value across a toggle', async () => {
      const user = userEvent.setup();
      const { getByLabelText } = await wrap(
        <TextField label="Password" value="hunter2" onChangeText={jest.fn()} secureTextEntry />,
      );
      await user.press(getByLabelText('Show password'));
      // Flipping `secureTextEntry` is only safe because the value is
      // controlled; this is the assertion that keeps it that way.
      expect(getByLabelText('Password').props.value).toBe('hunter2');
    });
  });
});
