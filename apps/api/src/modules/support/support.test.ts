import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { createShowtime, createUser, resetDb, type TestUser } from '../../test/helpers';

/**
 * The support agent.
 *
 * Groq is mocked throughout. The thing worth testing is not that a model can
 * hold a conversation — that is Groq's problem and it would make the suite
 * depend on somebody's API key and uptime — but that the server hands it the
 * right context and behaves sensibly when it is not there at all.
 *
 * So: what goes *into* the prompt (this account's bookings and nobody else's,
 * the real policy numbers), and what comes back out when the model is absent,
 * broken, or answering.
 */
interface Turn {
  role: string;
  content: string;
}

const groq = vi.hoisted(() => ({
  isGroqConfigured: vi.fn(() => false),
  // Typed with its argument so `mock.lastCall` carries the messages: what
  // most of these tests assert on is the context the server assembled, which
  // only exists in that argument.
  answer: vi.fn(
    async (_messages: { role: string; content: string }[]) =>
      null as { text: string; model: string } | null,
  ),
}));

vi.mock('../../lib/groq', () => groq);

const app = createApp();

/** The system prompt from the most recent call, which is where context lives. */
function lastSystemPrompt(): string {
  const messages = groq.answer.mock.lastCall?.[0] as
    { role: string; content: string }[] | undefined;
  return messages?.find((m) => m.role === 'system')?.content ?? '';
}

function ask(user: TestUser, message: string, history: unknown[] = []) {
  return request(app).post('/v1/support/ask').set(user.auth).send({ message, history });
}

describe('support agent', () => {
  beforeEach(async () => {
    await resetDb();
    groq.isGroqConfigured.mockReturnValue(false);
    groq.answer.mockReset();
    groq.answer.mockResolvedValue(null);
  });

  it('needs a session', async () => {
    await request(app).post('/v1/support/ask').send({ message: 'hello', history: [] }).expect(401);
  });

  it('rejects an empty message and an over-long one', async () => {
    const user = await createUser();

    await ask(user, '').expect(400);
    await ask(user, 'x'.repeat(1001)).expect(400);
    await ask(user, 'x'.repeat(1000)).expect(200);
  });

  it('answers from the model when one is configured', async () => {
    const user = await createUser();
    groq.isGroqConfigured.mockReturnValue(true);
    groq.answer.mockResolvedValue({ text: 'Cancel it from the Tickets tab.', model: 'test-model' });

    const res = await ask(user, 'how do I cancel?').expect(200);

    expect(res.body).toEqual({ text: 'Cancel it from the Tickets tab.', source: 'model' });
  });

  it('still answers when there is no API key, and says the answer is the grounded one', async () => {
    const user = await createUser();

    const res = await ask(user, 'what happens if I cancel my booking?').expect(200);

    expect(res.body.source).toBe('grounded');
    // The real numbers from env, not a model's recollection of them.
    expect(res.body.text).toContain('120 minutes');
    expect(res.body.text).toContain('₹30');
    expect(groq.answer).toHaveBeenCalled();
  });

  it('marks the answer differently when a key exists but the call failed', async () => {
    const user = await createUser();
    groq.isGroqConfigured.mockReturnValue(true);
    groq.answer.mockResolvedValue(null); // Groq having an afternoon.

    const res = await ask(user, 'how long do seats stay held?').expect(200);

    // The person gets an answer either way; the source tells them which.
    expect(res.body.source).toBe('grounded-fallback');
    expect(res.body.text).toContain('5 minutes');
  });

  it('never 500s because the model threw', async () => {
    const user = await createUser();
    groq.isGroqConfigured.mockReturnValue(true);
    groq.answer.mockRejectedValue(new Error('socket hang up'));

    // `answer()` is documented never to throw, but a support chat that goes
    // down with somebody else's service is the exact failure this feature
    // must not have, so the route is tested against it directly.
    const res = await ask(user, 'hello').expect(200);
    expect(res.body.source).toBe('grounded-fallback');
  });

  it('grounds the prompt in this account bookings and nobody else', async () => {
    groq.isGroqConfigured.mockReturnValue(true);
    groq.answer.mockResolvedValue({ text: 'ok', model: 'test-model' });

    const [mine, theirs] = [await createUser('mine'), await createUser('theirs')];
    const show = await createShowtime();

    const book = async (user: TestUser, seatIndex: number) => {
      const hold = await request(app)
        .post(`/v1/showtimes/${show.showtimeId}/holds`)
        .set(user.auth)
        .set('Idempotency-Key', `support-hold-${seatIndex}`)
        .send({ showSeatIds: [show.showSeatIds[seatIndex]] })
        .expect(201);
      const checkout = await request(app)
        .post('/v1/checkout')
        .set(user.auth)
        .set('Idempotency-Key', `support-${seatIndex}`)
        .send({ holdId: hold.body.id })
        .expect(201);
      return checkout.body.reference as string;
    };

    const myReference = await book(mine, 0);
    const theirReference = await book(theirs, 1);

    await ask(mine, 'what have I booked?').expect(200);

    const prompt = lastSystemPrompt();
    expect(prompt).toContain(myReference);
    // The reason this is scoped by userId in the query rather than filtered in
    // the prompt: somebody else's booking is not in the context at all, so no
    // instruction a customer types can make the agent read it out.
    expect(prompt).not.toContain(theirReference);
  });

  it('tells the model plainly when the account has no bookings', async () => {
    groq.isGroqConfigured.mockReturnValue(true);
    groq.answer.mockResolvedValue({ text: 'ok', model: 'test-model' });
    const user = await createUser();

    await ask(user, 'where is my ticket?').expect(200);

    expect(lastSystemPrompt()).toContain('This customer has no bookings yet.');
  });

  it('carries recent history but trims a long transcript', async () => {
    groq.isGroqConfigured.mockReturnValue(true);
    groq.answer.mockResolvedValue({ text: 'ok', model: 'test-model' });
    const user = await createUser();

    const history = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `turn ${i}`,
    }));

    // Twenty is the schema's ceiling; the service trims further before sending.
    await ask(user, 'and then?', history).expect(200);

    const sent = groq.answer.mock.lastCall![0] as Turn[];
    const carried = sent.filter((m) => m.content.startsWith('turn '));
    expect(carried).toHaveLength(8);
    expect(carried[0]!.content).toBe('turn 12');
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'and then?' });
  });

  it('refuses a history longer than the schema allows', async () => {
    const user = await createUser();
    const history = Array.from({ length: 21 }, () => ({ role: 'user', content: 'x' }));

    await ask(user, 'hi', history).expect(400);
  });

  it('defaults history to empty so the client may omit it', async () => {
    const user = await createUser();

    await request(app).post('/v1/support/ask').set(user.auth).send({ message: 'hi' }).expect(200);
  });
});
