import { render, userEvent } from '@testing-library/react-native';
import { TextField } from '../text-field';
import { ThemeProvider } from '../../../theme';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('TextField', () => {
  it('exposes the visible label as the accessible label, for a screen reader', async () => {
    const { getByLabelText } = await wrap(<TextField label="Email" value="" onChangeText={jest.fn()} />);
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
      <TextField label="Password" value="" onChangeText={jest.fn()} hint="At least 10 characters" />,
    );
    expect(getByText('At least 10 characters')).toBeTruthy();
  });
});
