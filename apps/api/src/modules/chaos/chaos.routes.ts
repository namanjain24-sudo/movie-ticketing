import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../../http/validate';
import { logger } from '../../logger';
import { mockGatewayControls } from '../payments/gateway';

/**
 * A control surface for the chaos suite, so scenarios can make the payment
 * gateway misbehave on demand instead of asking the operator to restart the
 * API with different environment variables between runs.
 *
 * Mounted only when CHAOS_CONTROLS_ENABLED is true, and `env.ts` refuses to
 * boot with that flag set in production. It is unauthenticated, which is
 * exactly why that guard is the security boundary.
 *
 * Run chaos against a single-process API (`npm run api`), not the cluster. A
 * control request reaches one worker, and a scenario that only broke one
 * eighth of the fleet would prove nothing.
 */

const controlsSchema = z.object({
  forceOutcome: z.enum(['SUCCESS', 'FAILURE']).nullish(),
  extraLatencyMs: z.number().int().min(0).max(30_000).optional(),
  duplicateWebhooks: z.boolean().optional(),
  outOfOrderWebhooks: z.boolean().optional(),
  dropWebhooks: z.boolean().optional(),
});

function snapshot() {
  return {
    forceOutcome: mockGatewayControls.forceOutcome,
    extraLatencyMs: mockGatewayControls.extraLatencyMs,
    duplicateWebhooks: mockGatewayControls.duplicateWebhooks,
    outOfOrderWebhooks: mockGatewayControls.outOfOrderWebhooks,
    dropWebhooks: mockGatewayControls.dropWebhooks,
  };
}

export const chaosRouter: Router = Router();

chaosRouter.post('/gateway', validateBody(controlsSchema), (req, res) => {
  const input = req.body as z.infer<typeof controlsSchema>;
  if (input.forceOutcome !== undefined) {
    mockGatewayControls.forceOutcome = input.forceOutcome ?? null;
  }
  if (input.extraLatencyMs !== undefined) mockGatewayControls.extraLatencyMs = input.extraLatencyMs;
  if (input.duplicateWebhooks !== undefined) {
    mockGatewayControls.duplicateWebhooks = input.duplicateWebhooks;
  }
  if (input.outOfOrderWebhooks !== undefined) {
    mockGatewayControls.outOfOrderWebhooks = input.outOfOrderWebhooks;
  }
  if (input.dropWebhooks !== undefined) mockGatewayControls.dropWebhooks = input.dropWebhooks;

  logger.warn({ controls: snapshot() }, 'Chaos controls changed');
  res.json(snapshot());
});

chaosRouter.post('/reset', (_req, res) => {
  mockGatewayControls.reset();
  res.json(snapshot());
});
