import {
  PLAN_CODE_ALPHABET,
  PLAN_CODE_LENGTH,
  type CreatePlanInput,
  type Plan,
  type PlanOption,
  type ShowFormat,
} from '@app/shared';
import { randomInt } from 'node:crypto';
import { prisma, type Tx } from '../../db';
import { HttpError } from '../../http/errors';
import { dbNow, withTxRetry } from '../../lib/tx';

/**
 * Watch parties.
 *
 * A plan is a shortlist of showings and a tally of who can make each one. It
 * holds no seats and takes no money: when the group settles on a showing,
 * somebody books it through the ordinary flow. That boundary is deliberate -
 * a plan that quietly reserved seats would be a hold with no expiry and no
 * payment, which is exactly the thing the booking mechanic exists to prevent.
 */

/** Characters that are never confused for one another. See the shared constant. */
function newCode(): string {
  let code = '';
  for (let i = 0; i < PLAN_CODE_LENGTH; i += 1) {
    // `randomInt`, not `Math.random`: a code is the only thing protecting a
    // plan from a stranger, and a predictable one is not protecting it.
    code += PLAN_CODE_ALPHABET[randomInt(PLAN_CODE_ALPHABET.length)];
  }
  return code;
}

const SHOWTIME_FOR_PLAN = {
  id: true,
  movieId: true,
  startsAt: true,
  endsAt: true,
  format: true,
  language: true,
  currency: true,
  salesCloseAt: true,
  tierPrices: { select: { priceMinor: true } },
  screen: { select: { cinema: { select: { name: true, city: true } } } },
} as const;

export async function createPlan(userId: string, input: CreatePlanInput): Promise<Plan> {
  const unique = [...new Set(input.showtimeIds)];
  if (unique.length < 2) {
    throw HttpError.badRequest('A plan needs at least two different showings to choose between');
  }

  const showtimes = await prisma.showtime.findMany({
    where: { id: { in: unique } },
    select: SHOWTIME_FOR_PLAN,
  });

  if (showtimes.length !== unique.length) {
    throw HttpError.badRequest('One of those showings no longer exists');
  }
  if (showtimes.some((s) => s.movieId !== input.movieId)) {
    throw HttpError.badRequest('Every showing in a plan has to be for the same film');
  }

  const cities = new Set(showtimes.map((s) => s.screen.cinema.city));
  if (cities.size !== 1) {
    // A shortlist spanning two cities is not a decision anybody can make.
    throw HttpError.badRequest('Every showing in a plan has to be in the same city');
  }
  const [city] = [...cities];

  const now = await dbNow(prisma);
  if (showtimes.some((s) => s.startsAt <= now)) {
    throw HttpError.badRequest('A plan cannot include a showing that has already started');
  }

  const expiresAt = showtimes.reduce(
    (latest, s) => (s.startsAt > latest ? s.startsAt : latest),
    showtimes[0]?.startsAt ?? now,
  );

  const code = await withTxRetry(
    async (tx) => {
      // Retried on collision rather than checked first: the unique index is
      // the only thing that actually decides, and a read-then-write would be
      // racing two organisers onto the same code anyway.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = newCode();
        const taken = await tx.plan.findUnique({
          where: { code: candidate },
          select: { id: true },
        });
        if (taken) continue;
        await tx.plan.create({
          data: {
            code: candidate,
            movieId: input.movieId,
            city: city ?? '',
            organiserId: userId,
            expiresAt,
            options: { create: unique.map((showtimeId) => ({ showtimeId })) },
            // The organiser is in their own plan. A tally that did not count
            // the person who made it would be wrong from the first vote.
            members: { create: { userId } },
          },
        });
        return candidate;
      }
      throw new Error('Could not allocate a plan code');
    },
    { label: 'createPlan' },
  );

  return getPlan(code, userId);
}

type PlanRow = {
  code: string;
  city: string;
  organiserId: string;
  expiresAt: Date;
  organiser: { name: string };
  movie: { id: string; slug: string; title: string; posterUrl: string };
  members: { userId: string }[];
  options: {
    id: string;
    showtime: {
      id: string;
      startsAt: Date;
      endsAt: Date;
      format: string;
      language: string;
      currency: string;
      tierPrices: { priceMinor: number }[];
      screen: { cinema: { name: string } };
    };
    votes: { userId: string }[];
  }[];
};

const PLAN_INCLUDE = {
  organiser: { select: { name: true } },
  movie: { select: { id: true, slug: true, title: true, posterUrl: true } },
  members: { select: { userId: true } },
  options: {
    select: {
      id: true,
      showtime: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          format: true,
          language: true,
          currency: true,
          tierPrices: { select: { priceMinor: true } },
          screen: { select: { cinema: { select: { name: true } } } },
        },
      },
      votes: { select: { userId: true } },
    },
  },
} as const;

function toWire(plan: PlanRow, userId: string | undefined, now: Date): Plan {
  const options: PlanOption[] = plan.options
    .map((option) => ({
      id: option.id,
      showtimeId: option.showtime.id,
      startsAt: option.showtime.startsAt.toISOString(),
      endsAt: option.showtime.endsAt.toISOString(),
      format: option.showtime.format as ShowFormat,
      language: option.showtime.language,
      currency: option.showtime.currency,
      fromPriceMinor: option.showtime.tierPrices.reduce(
        (min, tier) => Math.min(min, tier.priceMinor),
        Number.POSITIVE_INFINITY,
      ),
      // Coarse on purpose, as everywhere else: a plan is decided hours before
      // the booking, and an exact seat count would be stale by then.
      availability: 'PLENTY' as const,
      cinemaName: option.showtime.screen.cinema.name,
      votes: option.votes.length,
      youVoted: userId !== undefined && option.votes.some((vote) => vote.userId === userId),
    }))
    // Chronological. A shortlist is read as a timetable, not as a leaderboard:
    // ordering by votes would move the rows under somebody's thumb as the
    // tally came in.
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return {
    code: plan.code,
    movie: plan.movie,
    city: plan.city,
    organiserName: plan.organiser.name,
    youAreOrganiser: plan.organiserId === userId,
    youJoined: userId !== undefined && plan.members.some((member) => member.userId === userId),
    memberCount: plan.members.length,
    expiresAt: plan.expiresAt.toISOString(),
    settled: plan.expiresAt <= now,
    options,
  };
}

/** Codes are stored upper-case, so a code typed in any casing still opens. */
const normalise = (code: string) => code.trim().toUpperCase();

export async function getPlan(code: string, userId?: string): Promise<Plan> {
  const plan = await prisma.plan.findUnique({
    where: { code: normalise(code) },
    include: PLAN_INCLUDE,
  });
  if (!plan) throw HttpError.notFound('That plan does not exist');
  return toWire(plan, userId, await dbNow(prisma));
}

export async function joinPlan(code: string, userId: string): Promise<Plan> {
  const plan = await prisma.plan.findUnique({
    where: { code: normalise(code) },
    select: { id: true, expiresAt: true },
  });
  if (!plan) throw HttpError.notFound('That plan does not exist');

  const now = await dbNow(prisma);
  if (plan.expiresAt <= now) {
    throw HttpError.conflict('That plan is over');
  }

  // Idempotent: a second tap, or a link opened twice, is not an error.
  await prisma.planMember.upsert({
    where: { planId_userId: { planId: plan.id, userId } },
    create: { planId: plan.id, userId },
    update: {},
  });

  return getPlan(code, userId);
}

export async function toggleVote(code: string, userId: string, optionId: string): Promise<Plan> {
  await withTxRetry(
    async (tx: Tx) => {
      const plan = await tx.plan.findUnique({
        where: { code: normalise(code) },
        select: { id: true, expiresAt: true, members: { where: { userId }, select: { id: true } } },
      });
      if (!plan) throw HttpError.notFound('That plan does not exist');

      const now = await dbNow(tx);
      if (plan.expiresAt <= now) throw HttpError.conflict('That plan is over');

      // Voting without joining would let a tally exceed its own membership.
      if (plan.members.length === 0) {
        throw HttpError.forbidden('Join the plan before marking the showings you can make');
      }

      const option = await tx.planOption.findUnique({
        where: { id: optionId },
        select: { id: true, planId: true },
      });
      if (!option || option.planId !== plan.id) {
        throw HttpError.notFound('That showing is not on this plan');
      }

      const existing = await tx.planVote.findUnique({
        where: { optionId_userId: { optionId, userId } },
        select: { id: true },
      });
      if (existing) {
        await tx.planVote.delete({ where: { id: existing.id } });
      } else {
        await tx.planVote.create({ data: { optionId, userId } });
      }
    },
    { label: 'togglePlanVote' },
  );

  return getPlan(code, userId);
}

/** The plans this user is in that have not happened yet, soonest first. */
export async function listPlans(userId: string): Promise<Plan[]> {
  const now = await dbNow(prisma);
  const plans = await prisma.plan.findMany({
    where: { expiresAt: { gt: now }, members: { some: { userId } } },
    include: PLAN_INCLUDE,
    orderBy: { expiresAt: 'asc' },
  });
  return plans.map((plan) => toWire(plan, userId, now));
}
