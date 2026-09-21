import type { Review } from '@app/shared';
import type { ComponentProps } from 'react';
import { ReviewComposer } from '../review-composer';
import { render, userEvent } from '../../../test-utils';

const EXISTING: Review = {
  id: 'rev_1',
  rating: 4,
  body: 'Terrific for the first two acts.',
  authorName: 'Demo User',
  verified: true,
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
  mine: true,
};

function composer(props: Partial<ComponentProps<typeof ReviewComposer>> = {}) {
  return (
    <ReviewComposer
      visible
      movieTitle="Jawan"
      existing={null}
      submitting={false}
      deleting={false}
      error={null}
      onSubmit={jest.fn()}
      onDelete={jest.fn()}
      onClose={jest.fn()}
      {...props}
    />
  );
}

const renderComposer = (props: Partial<ComponentProps<typeof ReviewComposer>> = {}) =>
  render(composer(props));

describe('ReviewComposer', () => {
  it('will not post until a star is chosen', async () => {
    const onSubmit = jest.fn();
    const { getByRole } = await renderComposer({ onSubmit });

    await userEvent.press(getByRole('button', { name: 'Post review' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('posts the rating with no words when none were written', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, getByRole } = await renderComposer({ onSubmit });

    await userEvent.press(getByLabelText('5 out of 5 stars'));
    await userEvent.press(getByRole('button', { name: 'Post review' }));

    expect(onSubmit).toHaveBeenCalledWith({ rating: 5, body: null });
  });

  it('trims the body, and treats whitespace as nothing written', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, getByRole } = await renderComposer({ onSubmit });

    await userEvent.press(getByLabelText('3 out of 5 stars'));
    await userEvent.type(getByLabelText('Your review'), '   ');
    await userEvent.press(getByRole('button', { name: 'Post review' }));

    expect(onSubmit).toHaveBeenCalledWith({ rating: 3, body: null });
  });

  it('pre-fills from an existing review and offers to delete it', async () => {
    const { getByLabelText, getByText } = await renderComposer({ existing: EXISTING });

    expect(getByText('Edit your review')).toBeTruthy();
    expect(getByLabelText('Your review').props.value).toBe(EXISTING.body);
    expect(getByLabelText('4 out of 5 stars').props.accessibilityState.selected).toBe(true);
    expect(getByText('Delete my review')).toBeTruthy();
  });

  it('offers no delete for a review that does not exist yet', async () => {
    const { queryByText, getByText } = await renderComposer();
    expect(queryByText('Delete my review')).toBeNull();
    expect(getByText('Not now')).toBeTruthy();
  });

  /**
   * The reason the form is keyed rather than synced from an effect. A draft
   * left over from the previous film, sitting under the new film's title, is
   * one confident tap away from being posted about the wrong movie.
   */
  it('does not carry a draft across a reopen', async () => {
    const { getByLabelText, rerender } = await renderComposer({ existing: EXISTING });

    await userEvent.type(getByLabelText('Your review'), ' Actually, no.');

    await rerender(composer({ visible: false, existing: EXISTING }));
    await rerender(composer({ visible: true, existing: EXISTING }));

    expect(getByLabelText('Your review').props.value).toBe(EXISTING.body);
  });

  it('shows a write failure where the person is looking', async () => {
    const { getByText } = await renderComposer({ error: 'Could not post your review.' });
    expect(getByText('Could not post your review.')).toBeTruthy();
  });
});
