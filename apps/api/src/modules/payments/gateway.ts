import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../../env';
import { logger } from '../../logger';

/**
 * The gateway boundary. Everything the booking system knows about payments is
 * in this file, so swapping the mock for Razorpay or Stripe is one new
 * implementation and no changes to the booking logic.
 *
 * The mock is not a stub that always succeeds. It declines, it is slow, it
 * delivers webhooks out of order and more than once, because those are the
 * behaviours the system has to survive and a gateway that never misbehaves
 * proves nothing.
 */

export type GatewayIntentStatus = 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED';

export interface GatewayIntent {
  providerRef: string;
  clientSecret: string;
  status: GatewayIntentStatus;
  amountMinor: number;
  currency: string;
  failureReason?: string;
}

export interface GatewayWebhookEvent {
  id: string;
  type: 'payment.authorized' | 'payment.captured' | 'payment.failed';
  providerRef: string;
  amountMinor: number;
  currency: string;
  failureReason?: string;
}

export interface PaymentGateway {
  readonly name: string;
  /**
   * `providerRef` is supplied by us, not the gateway, and doubles as the
   * gateway's idempotency key. Because we choose it, the payment row can be
   * written in the same transaction as the booking, before the gateway is
   * ever called. That removes the window where a crash leaves a charge with
   * no local record of it.
   */
  createIntent(params: {
    providerRef: string;
    amountMinor: number;
    currency: string;
    method: string;
    description: string;
  }): Promise<GatewayIntent>;
  /** Authoritative state, used by reconciliation when local state is unclear. */
  fetchIntent(providerRef: string): Promise<GatewayIntent | null>;
  /**
   * Returns the money. Idempotent on `providerRef`: a refund asked for twice
   * is one refund, because a retry after a dropped response must not pay the
   * customer out a second time.
   */
  refund(params: {
    providerRef: string;
    amountMinor: number;
    reason: string;
  }): Promise<{ providerRef: string; refundedMinor: number }>;
  /** Returns null when the signature does not verify. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): GatewayWebhookEvent | null;
  /** Test-mode helper: sign a body the way the provider would. */
  signWebhook(rawBody: Buffer): string;
}

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

/**
 * Test hooks. The load test and the chaos suite reach in here to force an
 * outcome; nothing in the request path reads them beyond the mock itself.
 */
export const mockGatewayControls = {
  /** null means "decide randomly using MOCK_PAYMENT_FAILURE_RATE". */
  forceOutcome: null as 'SUCCESS' | 'FAILURE' | null,
  /** Extra latency on top of MOCK_PAYMENT_LATENCY_MS. */
  extraLatencyMs: 0,
  /** Deliver every webhook twice, to exercise deduplication. */
  duplicateWebhooks: false,
  /** Send `payment.captured` before `payment.authorized`. */
  outOfOrderWebhooks: false,
  /** Drop webhooks entirely, leaving reconciliation to resolve the payment. */
  dropWebhooks: false,
  reset() {
    this.forceOutcome = null;
    this.extraLatencyMs = 0;
    this.duplicateWebhooks = false;
    this.outOfOrderWebhooks = false;
    this.dropWebhooks = false;
  },
};

type Delivery = (event: GatewayWebhookEvent, rawBody: Buffer, signature: string) => Promise<void>;

/** Where the mock posts its callbacks. Wired up in app.ts. */
let deliver: Delivery = async () => {};
export function setWebhookDelivery(fn: Delivery): void {
  deliver = fn;
}

const intents = new Map<string, GatewayIntent>();

function sign(rawBody: Buffer): string {
  return createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

function eventId(providerRef: string, type: string): string {
  return `evt_${providerRef}_${type}`;
}

async function emit(event: GatewayWebhookEvent): Promise<void> {
  if (mockGatewayControls.dropWebhooks) return;
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = sign(rawBody);
  const times = mockGatewayControls.duplicateWebhooks ? 2 : 1;
  for (let i = 0; i < times; i++) {
    try {
      await deliver(event, rawBody, signature);
    } catch (err) {
      logger.error({ err, event: event.id }, 'Mock webhook delivery threw');
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Refunds already paid out, keyed by the ref they were issued against. */
const refunds = new Map<string, { providerRef: string; refundedMinor: number }>();

export const mockGateway: PaymentGateway = {
  name: 'mock',

  async createIntent({ providerRef, amountMinor, currency, description }) {
    // Same ref twice returns the same intent, exactly as a real gateway does
    // for a repeated idempotency key.
    const existing = intents.get(providerRef);
    if (existing) return existing;

    const intent: GatewayIntent = {
      providerRef,
      clientSecret: `${providerRef}_secret_${randomInt(1e9).toString(36)}`,
      status: 'PENDING',
      amountMinor,
      currency,
    };
    intents.set(providerRef, intent);

    // Settlement happens after the response, like a real gateway. The user is
    // told "confirming" and learns the outcome from the webhook or by polling.
    void settle(intent, description);

    return intent;
  },

  async fetchIntent(providerRef) {
    return intents.get(providerRef) ?? null;
  },

  async refund({ providerRef, amountMinor, reason }) {
    await sleep(env.MOCK_PAYMENT_LATENCY_MS);

    // Recorded against the ref, so asking twice pays out once — the same
    // guarantee `createIntent` gives, for the same reason.
    const already = refunds.get(providerRef);
    if (already) return already;

    const intent = intents.get(providerRef);
    if (intent) intent.status = 'CAPTURED';

    const result = { providerRef, refundedMinor: amountMinor };
    refunds.set(providerRef, result);
    logger.info({ providerRef, amountMinor, reason }, 'Mock gateway refunded');
    return result;
  },

  parseWebhook(rawBody, signature) {
    if (!signature) return null;
    const expected = Buffer.from(sign(rawBody));
    const received = Buffer.from(signature);
    // Constant-time, and length-checked first because timingSafeEqual throws
    // on a length mismatch.
    if (expected.length !== received.length) return null;
    if (!timingSafeEqual(expected, received)) return null;
    try {
      return JSON.parse(rawBody.toString('utf8')) as GatewayWebhookEvent;
    } catch {
      return null;
    }
  },

  signWebhook: sign,
};

async function settle(intent: GatewayIntent, description: string): Promise<void> {
  await sleep(env.MOCK_PAYMENT_LATENCY_MS + mockGatewayControls.extraLatencyMs);

  const forced = mockGatewayControls.forceOutcome;
  const succeeds =
    forced === 'SUCCESS'
      ? true
      : forced === 'FAILURE'
        ? false
        : Math.random() >= env.MOCK_PAYMENT_FAILURE_RATE;

  if (!succeeds) {
    intent.status = 'FAILED';
    intent.failureReason = 'Your bank declined the payment';
    await emit({
      id: eventId(intent.providerRef, 'failed'),
      type: 'payment.failed',
      providerRef: intent.providerRef,
      amountMinor: intent.amountMinor,
      currency: intent.currency,
      failureReason: intent.failureReason,
    });
    return;
  }

  intent.status = 'CAPTURED';
  const authorized: GatewayWebhookEvent = {
    id: eventId(intent.providerRef, 'authorized'),
    type: 'payment.authorized',
    providerRef: intent.providerRef,
    amountMinor: intent.amountMinor,
    currency: intent.currency,
  };
  const captured: GatewayWebhookEvent = {
    id: eventId(intent.providerRef, 'captured'),
    type: 'payment.captured',
    providerRef: intent.providerRef,
    amountMinor: intent.amountMinor,
    currency: intent.currency,
  };

  // Real gateways do not guarantee ordering. The handler must reach the same
  // final state either way, so the chaos suite can flip this on.
  const order = mockGatewayControls.outOfOrderWebhooks
    ? [captured, authorized]
    : [authorized, captured];
  for (const event of order) await emit(event);

  logger.debug({ providerRef: intent.providerRef, description }, 'Mock payment captured');
}

/** Wipes mock state between test files. */
export function resetMockGateway(): void {
  intents.clear();
  refunds.clear();
  mockGatewayControls.reset();
}

export const gateway: PaymentGateway = mockGateway;
