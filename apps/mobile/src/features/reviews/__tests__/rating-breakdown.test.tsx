import { RatingBreakdown } from '../rating-breakdown';
import { render, userEvent } from '../../../test-utils';

const FULL_SPREAD = [
  { rating: 5, count: 12 },
  { rating: 4, count: 6 },
  { rating: 3, count: 2 },
  { rating: 2, count: 0 },
  { rating: 1, count: 3 },
];

const EMPTY = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: 0 }));

describe('RatingBreakdown', () => {
  it('leads with the average and how many people are behind it', async () => {
    const { getByText } = await render(
      <RatingBreakdown average={4.16} count={23} breakdown={FULL_SPREAD} onFilter={jest.fn()} />,
    );

    expect(getByText('4.2')).toBeTruthy();
    expect(getByText('23 reviews')).toBeTruthy();
  });

  it('says "review" in the singular, because one is not "1 reviews"', async () => {
    const { getByText } = await render(
      <RatingBreakdown
        average={5}
        count={1}
        breakdown={[{ rating: 5, count: 1 }]}
        onFilter={jest.fn()}
      />,
    );
    expect(getByText('1 review')).toBeTruthy();
  });

  it('asks for the first review instead of drawing an empty chart', async () => {
    const { getByText, queryByText } = await render(
      <RatingBreakdown average={null} count={0} breakdown={EMPTY} onFilter={jest.fn()} />,
    );

    expect(getByText('No reviews yet')).toBeTruthy();
    expect(queryByText('0.0')).toBeNull();
  });

  it('filters to a star when its bar is tapped', async () => {
    const onFilter = jest.fn();
    const { getByLabelText } = await render(
      <RatingBreakdown average={4.2} count={23} breakdown={FULL_SPREAD} onFilter={onFilter} />,
    );

    await userEvent.press(getByLabelText('3 reviews at 1 stars'));

    expect(onFilter).toHaveBeenCalledWith(1);
  });

  it('clears the filter when the active bar is tapped again', async () => {
    const onFilter = jest.fn();
    const { getByLabelText } = await render(
      <RatingBreakdown
        average={4.2}
        count={23}
        breakdown={FULL_SPREAD}
        activeRating={5}
        onFilter={onFilter}
      />,
    );

    await userEvent.press(getByLabelText('12 reviews at 5 stars, showing only these'));

    expect(onFilter).toHaveBeenCalledWith(undefined);
  });

  // Filtering to a star nobody chose produces an empty list, which is a worse
  // answer than the bar simply not being a button.
  it('does not let an empty bar be tapped', async () => {
    const onFilter = jest.fn();
    const { getByLabelText } = await render(
      <RatingBreakdown average={4.2} count={23} breakdown={FULL_SPREAD} onFilter={onFilter} />,
    );

    await userEvent.press(getByLabelText('0 reviews at 2 stars'));

    expect(onFilter).not.toHaveBeenCalled();
  });
});
