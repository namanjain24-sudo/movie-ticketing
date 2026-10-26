import { formatMoney, type SupportAnswer, type SupportTurn } from '@app/shared';
import { prisma } from '../../db';
import { env } from '../../env';
import { answer, isGroqConfigured, type ChatTurn } from '../../lib/groq';

/**
 * The in-app support agent.
 *
 * ## It answers from this server's data, not from the model's memory
 *
 * A support agent that invents a booking reference, a refund amount or a
 * cancellation deadline is worse than no support agent, because the person
 * believes it. So the model never reasons about this product from training
 * data: the server assembles a context of facts it has just read out of the
 * database — this user's actual bookings, the actual policy numbers from
 * `env` — and the system prompt's main instruction is to use only that and to
 * say plainly when the answer is not in it.
 *
 * ## It works with no API key
 *
 * `GROQ_API_KEY` unset is a mode, not an error. The same context that grounds
 * the model also answers the handful of questions that make up most of a
 * ticketing app's support load, so `groundedReply` handles those directly and
 * the response says which of the two answered. That keeps the feature
 * demonstrable from a fresh clone, which is the same bargain the mailer makes.
 */

/** How much history is carried. Enough for a follow-up, not a transcript. */
const MAX_TURNS = 8;

/** Bookings put in front of the model. Recent ones answer almost everything. */
const MAX_BOOKINGS = 5;

function policyFacts(): string[] {
  const window = env.CANCELLATION_WINDOW_MINUTES;
  return [
    `Seats are held for ${Math.round(env.HOLD_TTL_SECONDS / 60)} minutes while the customer pays. After that the hold expires and the seats go back on sale.`,
    `A booking can be cancelled up to ${window} minutes (${Math.round(window / 60)} hours) before the show starts. Past that it cannot be cancelled.`,
    `On cancellation the ticket price is refunded to the original payment method. The ${formatMoney(env.BOOKING_FEE_MINOR, 'INR')} booking fee is never refunded, and money a promo code already took off is not refunded either.`,
    `One booking can hold at most ${env.MAX_SEATS_PER_BOOKING} seats.`,
    `A promo code is validated by the server against the actual subtotal at checkout, and each code can be used once per account.`,
    `Loyalty points are earned when a booking is confirmed and can be redeemed against a later booking. Cancelling reverses the points that booking earned.`,
    'A ticket QR is signed, so a gate scanner can verify it without a network. Tickets are also saved on the phone and open without a connection.',
    'Events — matches, concerts, comedy, workshops, theatre — are booked exactly like films. At a ground the price bands are the real stands, and the stand name is printed on the ticket.',
  ];
}

/**
 * A moment as the customer experiences it, which is India.
 *
 * The database is pinned to UTC and every timestamp above the storage layer is
 * an ISO string, which is right everywhere else in this API and wrong here:
 * these lines are read out loud to a person, and when there is no API key they
 * are the answer, verbatim. "2026-10-26T08:00:00.000Z" is not a showtime
 * anybody recognises as half past one in the afternoon.
 *
 * Both the booking and the current time go through this, so a model asked
 * whether a show can still be cancelled is comparing two clocks that agree.
 */
const IST = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function istMoment(date: Date): string {
  return `${IST.format(date)} IST`;
}

/**
 * The user's own bookings, flattened to lines a model can quote safely.
 *
 * Only this user's: the query is scoped by `userId`, so there is no prompt
 * anybody could write that would make the agent read somebody else's ticket,
 * because somebody else's ticket is not in the context to begin with.
 */
async function bookingFacts(userId: string): Promise<string[]> {
  const rows = await prisma.booking.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: MAX_BOOKINGS,
    select: {
      reference: true,
      status: true,
      totalMinor: true,
      currency: true,
      createdAt: true,
      showSeats: { select: { seat: { select: { rowLabel: true, number: true } } } },
      showtime: {
        select: {
          startsAt: true,
          movie: { select: { title: true } },
          event: { select: { title: true, kind: true } },
          screen: { select: { name: true, cinema: { select: { name: true, city: true } } } },
        },
      },
    },
  });

  if (rows.length === 0) return ['This customer has no bookings yet.'];

  return rows.map((b) => {
    const what = b.showtime.movie?.title ?? b.showtime.event?.title ?? 'a booking';
    const seats = b.showSeats.map((s) => `${s.seat.rowLabel}${s.seat.number}`).join(', ');
    const starts = istMoment(b.showtime.startsAt);
    const venue = `${b.showtime.screen.cinema.name}, ${b.showtime.screen.cinema.city}`;
    return (
      `Booking ${b.reference}: ${what} at ${venue} (${b.showtime.screen.name}), ` +
      `starts ${starts}, seats ${seats || 'none'}, status ${b.status}, ` +
      `paid ${formatMoney(b.totalMinor, b.currency)}.`
    );
  });
}

function systemPrompt(facts: string[], bookings: string[]): string {
  return [
    'You are the support agent inside Boxoffice, an Indian ticket booking app for films and live events.',
    '',
    'Rules, in order of importance:',
    "1. Answer ONLY from the FACTS and THIS CUSTOMER'S BOOKINGS below. They were read from the database seconds ago and are the only things you know about this product.",
    '2. If the answer is not in them, say so in one sentence and name the screen in the app where it can be found (Tickets, Profile, the seat map, checkout). Never guess.',
    '3. Never invent a booking reference, an amount, a date, a seat or a policy. If a customer names a booking that is not listed below, say you cannot see it on this account.',
    '4. You cannot perform actions — you cannot cancel, refund, rebook or change anything. Explain where the customer does it themselves.',
    '5. Be brief. Two or three sentences. No bullet lists unless the answer genuinely is a list. No greetings, no sign-offs, no "I hope this helps".',
    '6. Indian English, rupees, and the 24-hour or am/pm format the customer uses.',
    '',
    'FACTS ABOUT HOW BOXOFFICE WORKS:',
    ...facts.map((f) => `- ${f}`),
    '',
    "THIS CUSTOMER'S BOOKINGS (most recent first):",
    ...bookings.map((b) => `- ${b}`),
    '',
    `Current time: ${istMoment(new Date())}.`,
  ].join('\n');
}

/**
 * What the agent can say with no model at all.
 *
 * Not a chatbot and not pretending to be one: a short lookup over the same
 * context, covering the questions that make up most of a ticketing app's
 * support load. It exists so the feature is usable from a fresh clone with no
 * API key, and the caller tells the user which answered.
 */
function groundedReply(question: string, facts: string[], bookings: string[]): string {
  const q = question.toLowerCase();

  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has('cancel', 'refund', 'money back')) {
    return `${facts[1]} ${facts[2]} You can cancel from the ticket itself, under Tickets.`;
  }
  if (has('hold', 'held', 'timer', 'five minutes', '5 minutes', 'expired')) {
    return facts[0]!;
  }
  if (has('promo', 'coupon', 'discount', 'code')) {
    return facts[4]!;
  }
  if (has('point', 'loyalty', 'reward')) {
    return facts[5]!;
  }
  if (has('qr', 'offline', 'no signal', 'scan', 'gate')) {
    return facts[6]!;
  }
  if (has('stand', 'stadium', 'match', 'concert', 'workshop', 'event')) {
    return facts[7]!;
  }
  if (has('my booking', 'my ticket', 'booking', 'booked', 'ticket', 'reference')) {
    return bookings[0]?.startsWith('This customer has no bookings')
      ? 'There are no bookings on this account yet. Once you book something it appears under Tickets.'
      : `Here is what is on this account:\n${bookings.join('\n')}`;
  }
  if (has('seat', 'how many')) {
    return facts[3]!;
  }

  return (
    'I can answer questions about holds, cancellations and refunds, promo codes, loyalty points, ' +
    'tickets offline, and the bookings on this account. Ask me one of those, or check the Tickets ' +
    'tab for anything specific to a booking.'
  );
}

export async function reply(params: {
  userId: string;
  message: string;
  history: SupportTurn[];
}): Promise<SupportAnswer> {
  const facts = policyFacts();
  const bookings = await bookingFacts(params.userId);

  // Trimmed before it is sent, not after: a long transcript costs tokens on
  // every turn and adds nothing after the last few exchanges.
  const history = params.history.slice(-MAX_TURNS);

  const messages: ChatTurn[] = [
    { role: 'system', content: systemPrompt(facts, bookings) },
    ...history.map((t) => ({ role: t.role, content: t.content }) satisfies ChatTurn),
    { role: 'user', content: params.message },
  ];

  // `answer()` is documented never to throw, and this catch is here anyway.
  // The cost of being wrong about that is a support chat that goes down at
  // exactly the moment somebody needs support, and the fallback below is
  // already written.
  const result = await answer(messages).catch(() => null);

  if (result) return { text: result.text, source: 'model' };

  return {
    text: groundedReply(params.message, facts, bookings),
    // `grounded` rather than silently passing it off as the model: if the key
    // is missing or Groq is down, the person deserves to know they are
    // getting the short answer rather than the considered one.
    source: isGroqConfigured() ? 'grounded-fallback' : 'grounded',
  };
}
