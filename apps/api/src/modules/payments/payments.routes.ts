import { Router } from 'express';
import { checkoutSchema } from '@app/shared';
import { authenticate, requireUserId } from '../../middleware/authenticate';
import { pathParam, validateBody } from '../../http/validate';
import { requireIdempotencyKey, withIdempotency } from '../../lib/idempotency';
import * as payments from './payments.service';

export const paymentsRouter: Router = Router();

/**
 * Starting a payment is the other request that must never run twice. The key
 * also becomes the gateway's idempotency key, so a retry cannot open a second
 * charge even if this service has forgotten the first.
 */
paymentsRouter.post('/checkout', authenticate, validateBody(checkoutSchema), async (req, res) => {
  const userId = requireUserId(req);
  const key = requireIdempotencyKey(req);

  const result = await withIdempotency({
    key,
    scope: 'POST /v1/checkout',
    userId,
    request: req.body,
    run: async () => ({
      status: 201,
      body: await payments.checkout({
        userId,
        holdId: req.body.holdId,
        method: req.body.method,
        promoCode: req.body.promoCode,
        addOns: req.body.addOns,
        idempotencyKey: key,
      }),
    }),
  });

  res.setHeader('Idempotent-Replay', String(result.replayed));
  res.status(result.status).json(result.body);
});

/** Backs the "confirming your payment" state after an ambiguous submit. */
paymentsRouter.get('/payments/:id', authenticate, async (req, res) => {
  res.json(
    await payments.getPaymentStatus({
      userId: requireUserId(req),
      paymentId: pathParam(req, 'id'),
    }),
  );
});

/**
 * Gateway callbacks. Unauthenticated by necessity and therefore verified by
 * HMAC signature over the raw body, which is why `app.ts` keeps the raw buffer
 * around instead of only the parsed JSON.
 *
 * Always answers 200 once the signature checks out, even when processing
 * fails: a gateway that receives an error retries forever, and the event is
 * already durable for reconciliation to pick up.
 */
paymentsRouter.post('/payments/webhook', async (req, res) => {
  const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  await payments.handleWebhook(rawBody, req.header('x-webhook-signature'));
  res.status(200).json({ received: true });
});
