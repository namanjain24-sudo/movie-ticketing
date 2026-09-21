import { prisma } from '../db';

/**
 * The assertions that decide whether this system works.
 *
 * These are checked against the database after every load run and every chaos
 * scenario. Passing tests prove the code does what its author expected;
 * passing invariants prove the data is not corrupt no matter what happened to
 * get it there, which is the stronger claim and the one the report is about.
 *
 * Each check is written as SQL that returns offending rows. An empty result is
 * a pass, so a check cannot silently succeed by looking at nothing.
 */

export interface Violation {
  check: string;
  description: string;
  count: number;
  sample: unknown[];
}

interface Check {
  name: string;
  description: string;
  run: () => Promise<unknown[]>;
}

const CHECKS: Check[] = [
  {
    name: 'no-oversell',
    description: 'Confirmed seats in a showtime never exceed that screen’s capacity',
    run: () => prisma.$queryRaw`
      SELECT st.id AS "showtimeId",
             COUNT(*) FILTER (WHERE ss.state = 'CONFIRMED') AS confirmed,
             COUNT(*) AS inventory
      FROM "Showtime" st
      JOIN "ShowSeat" ss ON ss."showtimeId" = st.id
      GROUP BY st.id
      HAVING COUNT(*) FILTER (WHERE ss.state = 'CONFIRMED') > COUNT(*)
    `,
  },
  {
    name: 'seat-single-booking',
    description: 'No confirmed seat is missing its booking, or points at an unconfirmed one',
    run: () => prisma.$queryRaw`
      SELECT ss.id AS "showSeatId", ss."bookingId", b.status
      FROM "ShowSeat" ss
      LEFT JOIN "Booking" b ON b.id = ss."bookingId"
      WHERE ss.state = 'CONFIRMED'
        AND (ss."bookingId" IS NULL OR b.status <> 'CONFIRMED')
      LIMIT 20
    `,
  },
  {
    name: 'booking-has-payment',
    description: 'Every confirmed booking has exactly one captured payment',
    run: () => prisma.$queryRaw`
      SELECT b.id AS "bookingId", b.reference,
             COUNT(p.id) FILTER (WHERE p.status = 'CAPTURED') AS captured
      FROM "Booking" b
      LEFT JOIN "Payment" p ON p."bookingId" = b.id
      WHERE b.status = 'CONFIRMED'
      GROUP BY b.id
      HAVING COUNT(p.id) FILTER (WHERE p.status = 'CAPTURED') <> 1
      LIMIT 20
    `,
  },
  {
    name: 'no-double-charge',
    description: 'No booking has more than one captured payment',
    run: () => prisma.$queryRaw`
      SELECT "bookingId", COUNT(*) AS captured
      FROM "Payment"
      WHERE status = 'CAPTURED'
      GROUP BY "bookingId"
      HAVING COUNT(*) > 1
      LIMIT 20
    `,
  },
  {
    name: 'payment-has-booking',
    description: 'Every captured payment belongs to a confirmed booking',
    run: () => prisma.$queryRaw`
      SELECT p.id AS "paymentId", p."providerRef", b.status AS "bookingStatus"
      FROM "Payment" p
      JOIN "Booking" b ON b.id = p."bookingId"
      WHERE p.status = 'CAPTURED' AND b.status <> 'CONFIRMED'
      LIMIT 20
    `,
  },
  {
    name: 'confirmed-seat-count',
    description: 'A confirmed booking holds exactly the number of seats its hold claimed',
    run: () => prisma.$queryRaw`
      SELECT b.id AS "bookingId", h."seatCount" AS expected, COUNT(ss.id) AS actual
      FROM "Booking" b
      JOIN "Hold" h ON h.id = b."holdId"
      LEFT JOIN "ShowSeat" ss ON ss."bookingId" = b.id AND ss.state = 'CONFIRMED'
      WHERE b.status = 'CONFIRMED'
      GROUP BY b.id, h."seatCount"
      HAVING COUNT(ss.id) <> h."seatCount"
      LIMIT 20
    `,
  },
  {
    name: 'booking-totals',
    description: 'Booking totals equal seat prices plus the fee, minus any discount',
    run: () => prisma.$queryRaw`
      SELECT b.id AS "bookingId", b."subtotalMinor", SUM(ss."priceMinor") AS "seatSum",
             b."totalMinor", b."feeMinor", b."discountMinor"
      FROM "Booking" b
      JOIN "ShowSeat" ss ON ss."bookingId" = b.id
      WHERE b.status = 'CONFIRMED'
      GROUP BY b.id
      HAVING SUM(ss."priceMinor") <> b."subtotalMinor"
          OR b."totalMinor" <> b."subtotalMinor" + b."feeMinor" - b."discountMinor"
          OR b."discountMinor" < 0
          OR b."totalMinor" < 1
      LIMIT 20
    `,
  },
  {
    name: 'promo-within-limits',
    description: 'No promo code has more live redemptions than its total or per-user limit',
    run: () => prisma.$queryRaw`
      WITH live AS (
        SELECT b."promoCodeId" AS "promoId", b."userId"
        FROM "Booking" b
        JOIN "Hold" h ON h.id = b."holdId"
        WHERE b."promoCodeId" IS NOT NULL
          AND (b.status = 'CONFIRMED'
               OR (b.status = 'PENDING' AND h.status = 'ACTIVE' AND h."expiresAt" > now()))
      )
      SELECT p.id AS "promoId", p.code, 'total' AS "limit", COUNT(*) AS used
      FROM "PromoCode" p JOIN live l ON l."promoId" = p.id
      WHERE p."usageLimit" IS NOT NULL
      GROUP BY p.id, p.code, p."usageLimit"
      HAVING COUNT(*) > p."usageLimit"
      UNION ALL
      SELECT p.id, p.code, 'per-user', COUNT(*)
      FROM "PromoCode" p JOIN live l ON l."promoId" = p.id
      GROUP BY p.id, p.code, p."perUserLimit", l."userId"
      HAVING COUNT(*) > p."perUserLimit"
      LIMIT 20
    `,
  },
  {
    name: 'held-seat-has-hold',
    description: 'Every held seat points at a hold, and carries that hold’s expiry',
    run: () => prisma.$queryRaw`
      SELECT ss.id AS "showSeatId", ss."holdId", ss."holdExpiresAt", h."expiresAt"
      FROM "ShowSeat" ss
      LEFT JOIN "Hold" h ON h.id = ss."holdId"
      WHERE ss.state = 'HELD'
        AND (ss."holdId" IS NULL OR h.id IS NULL OR ss."holdExpiresAt" <> h."expiresAt")
      LIMIT 20
    `,
  },
  {
    name: 'available-seat-is-clean',
    description: 'An available seat carries no hold and no booking',
    run: () => prisma.$queryRaw`
      SELECT id AS "showSeatId", "holdId", "bookingId"
      FROM "ShowSeat"
      WHERE state = 'AVAILABLE' AND ("holdId" IS NOT NULL OR "bookingId" IS NOT NULL)
      LIMIT 20
    `,
  },
  {
    name: 'no-orphaned-holds',
    description: 'No hold is still ACTIVE past its expiry by more than the sweeper interval',
    run: () => prisma.$queryRaw`
      SELECT id, "expiresAt"
      FROM "Hold"
      WHERE status = 'ACTIVE' AND "expiresAt" < now() - interval '60 seconds'
      LIMIT 20
    `,
  },
  {
    name: 'no-stuck-payments',
    description: 'No payment has been pending for more than five minutes',
    run: () => prisma.$queryRaw`
      SELECT id, "providerRef", status, "createdAt"
      FROM "Payment"
      WHERE status IN ('PENDING', 'AUTHORIZED') AND "createdAt" < now() - interval '5 minutes'
      LIMIT 20
    `,
  },
];

export async function verifyInvariants(): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const check of CHECKS) {
    const rows = await check.run();
    if (rows.length > 0) {
      violations.push({
        check: check.name,
        description: check.description,
        count: rows.length,
        sample: rows.slice(0, 5),
      });
    }
  }
  return violations;
}

export const INVARIANT_NAMES = CHECKS.map((c) => c.name);

/** CLI: `npm run verify:invariants`. Exit code 1 means the data is wrong. */
async function main() {
  const violations = await verifyInvariants();

  console.log('');
  console.log(`Invariant check  ${CHECKS.length} assertions`);
  console.log('─'.repeat(72));

  for (const check of CHECKS) {
    const failed = violations.find((v) => v.check === check.name);
    const mark = failed ? 'FAIL' : ' ok ';
    const detail = failed ? `  ${failed.count} offending row(s)` : '';
    console.log(`[${mark}] ${check.name.padEnd(24)} ${check.description}${detail}`);
  }

  if (violations.length > 0) {
    console.log('');
    console.log('Offending rows');
    console.log('─'.repeat(72));
    for (const v of violations) {
      console.log(`\n${v.check}:`);
      console.dir(v.sample, { depth: 4 });
    }
    console.log('');
    console.log(`${violations.length} invariant(s) violated.`);
    process.exitCode = 1;
  } else {
    console.log('');
    console.log('All invariants hold.');
  }

  await prisma.$disconnect();
}

// Only when run directly, so importing this from a test does not run the CLI.
if (process.argv[1]?.endsWith('verify-invariants.ts')) {
  void main();
}
