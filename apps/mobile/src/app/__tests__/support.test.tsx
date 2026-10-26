import type { SupportAnswer } from '@app/shared';
import { userEvent } from '@testing-library/react-native';
import { ApiRequestError } from '../../api/client';
import { supportApi } from '../../api/support';
import SupportScreen from '../support';
import { render, waitFor } from '../../test-utils';

jest.mock('../../api/support', () => ({
  supportApi: { ask: jest.fn() },
}));

const ask = supportApi.ask as jest.MockedFunction<typeof supportApi.ask>;

function modelAnswer(text: string): SupportAnswer {
  return { text, source: 'model' };
}

async function mount() {
  const view = await render(<SupportScreen />);
  const user = userEvent.setup();

  return {
    ...view,
    /** Type a question and tap send, the way a customer gets there. */
    async send(question: string) {
      await user.type(view.getByLabelText('Your question'), question);
      await user.press(view.getByLabelText('Send'));
    },
    tap: user.press,
  };
}

describe('support chat', () => {
  beforeEach(() => {
    ask.mockReset();
    ask.mockResolvedValue(modelAnswer('You can cancel from the Tickets tab.'));
  });

  it('shows the answer to a typed question', async () => {
    const view = await mount();

    await view.send('how do I cancel?');

    expect(await view.findByText('You can cancel from the Tickets tab.')).toBeTruthy();
    expect(ask).toHaveBeenCalledWith('how do I cancel?', []);
  });

  it('sends an opener with one tap and then puts the openers away', async () => {
    const view = await mount();

    await view.tap(view.getByText('How do I cancel a booking?'));

    await waitFor(() => expect(ask).toHaveBeenCalledWith('How do I cancel a booking?', []));
    // They are openers, not a permanent menu under a live conversation.
    expect(view.queryByText('How long are my seats held?')).toBeNull();
  });

  it('carries the conversation but never the greeting', async () => {
    const view = await mount();

    await view.send('first');
    await view.findByText('You can cancel from the Tickets tab.');

    ask.mockResolvedValue(modelAnswer('second answer'));
    await view.send('second');
    await view.findByText('second answer');

    // The greeting is this screen's own text. Sending it back would ask the
    // server to reason about words it never wrote.
    expect(ask).toHaveBeenLastCalledWith('second', [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'You can cancel from the Tickets tab.' },
    ]);
  });

  it('says so the first time an answer came from the help notes, and only then', async () => {
    ask.mockResolvedValue({ text: 'Seats are held for 5 minutes.', source: 'grounded-fallback' });
    const view = await mount();

    await view.send('how long?');
    await view.findByText('Seats are held for 5 minutes.');
    expect(view.getByText(/assistant is unavailable/)).toBeTruthy();

    ask.mockResolvedValue({ text: 'One booking holds 10 seats.', source: 'grounded-fallback' });
    await view.send('how many seats?');
    await view.findByText('One booking holds 10 seats.');

    // Repeating the disclosure under every reply turns it into noise.
    expect(view.getAllByText(/assistant is unavailable/)).toHaveLength(1);
  });

  it('does not disclose anything when the model answered', async () => {
    const view = await mount();

    await view.send('hello');
    await view.findByText('You can cancel from the Tickets tab.');

    expect(view.queryByText(/assistant is unavailable/)).toBeNull();
  });

  it('points an offline customer at the tickets that are already on the phone', async () => {
    ask.mockRejectedValue(new ApiRequestError(0, 'NETWORK', 'Network request failed'));
    const view = await mount();

    await view.send('where is my ticket?');

    expect(await view.findByText(/still saved on this phone/)).toBeTruthy();
  });

  it('surfaces a server error as a turn rather than a dead screen', async () => {
    ask.mockRejectedValue(
      new ApiRequestError(
        429,
        'RATE_LIMITED',
        'That is a lot of questions. Try again in a little while.',
      ),
    );
    const view = await mount();

    await view.send('again');

    expect(
      await view.findByText('That is a lot of questions. Try again in a little while.'),
    ).toBeTruthy();
  });

  it('will not send an empty question', async () => {
    const view = await mount();

    await view.tap(view.getByLabelText('Send'));

    expect(ask).not.toHaveBeenCalled();
  });
});
