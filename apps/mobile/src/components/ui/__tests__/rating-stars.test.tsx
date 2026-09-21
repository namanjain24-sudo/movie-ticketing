import { render, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { RatingInput, RatingPill, RatingStars } from '../rating-stars';
import { ThemeProvider } from '../../../theme';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('RatingStars', () => {
  it('describes the rating for a screen reader, which cannot see the glyphs', async () => {
    const { getByLabelText } = await wrap(<RatingStars value={4} />);
    expect(getByLabelText('4 out of 5 stars')).toBeTruthy();
  });

  it('rounds the spoken value rather than reading out a float', async () => {
    const { getByLabelText } = await wrap(<RatingStars value={4.26666} />);
    expect(getByLabelText('4.3 out of 5 stars')).toBeTruthy();
  });
});

describe('RatingPill', () => {
  it('shows the average to one decimal and the number of voices behind it', async () => {
    const { getByText } = await wrap(<RatingPill average={4.25} count={18} />);
    expect(getByText('4.3')).toBeTruthy();
    expect(getByText('(18)')).toBeTruthy();
  });

  // A film nobody has reviewed does not have an average of 0.0, and drawing
  // one would be a claim about the film rather than about the data.
  it('says so plainly when nobody has rated the film', async () => {
    const { getByText, queryByText } = await wrap(<RatingPill average={null} count={0} />);
    expect(getByText('Not rated yet')).toBeTruthy();
    expect(queryByText('0.0')).toBeNull();
  });

  it('treats a stale average with no reviews behind it as unrated', async () => {
    const { getByText } = await wrap(<RatingPill average={4.5} count={0} />);
    expect(getByText('Not rated yet')).toBeTruthy();
  });
});

describe('RatingInput', () => {
  it('offers exactly five choices, each labelled', async () => {
    const { getAllByRole, getByLabelText } = await wrap(
      <RatingInput value={null} onChange={jest.fn()} />,
    );
    expect(getAllByRole('radio')).toHaveLength(5);
    expect(getByLabelText('1 out of 5 stars')).toBeTruthy();
    expect(getByLabelText('5 out of 5 stars')).toBeTruthy();
  });

  it('reports the star that was tapped', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await wrap(<RatingInput value={null} onChange={onChange} />);

    await userEvent.press(getByLabelText('4 out of 5 stars'));

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('marks only the chosen star as selected', async () => {
    const { getByLabelText } = await wrap(<RatingInput value={3} onChange={jest.fn()} />);

    expect(getByLabelText('3 out of 5 stars').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('2 out of 5 stars').props.accessibilityState.selected).toBe(false);
  });

  // Rating a film is a decision people change their mind about mid-tap.
  it('lets a rating be lowered as well as raised', async () => {
    function Harness() {
      const [rating, setRating] = useState<number | null>(null);
      return <RatingInput value={rating} onChange={setRating} />;
    }
    const { getByLabelText } = await wrap(<Harness />);

    await userEvent.press(getByLabelText('5 out of 5 stars'));
    expect(getByLabelText('5 out of 5 stars').props.accessibilityState.selected).toBe(true);

    await userEvent.press(getByLabelText('2 out of 5 stars'));
    expect(getByLabelText('2 out of 5 stars').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('5 out of 5 stars').props.accessibilityState.selected).toBe(false);
  });
});
