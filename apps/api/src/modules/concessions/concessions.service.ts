import type { AddOnLine, ConcessionItem } from '@app/shared';
import { prisma, type Tx } from '../../db';
import { HttpError } from '../../http/errors';

/** The active menu, for the checkout screen. */
export async function listConcessions(): Promise<ConcessionItem[]> {
  const items = await prisma.concessionItem.findMany({
    where: { active: true },
    orderBy: { priceMinor: 'asc' },
  });
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    priceMinor: i.priceMinor,
    currency: i.currency,
  }));
}

export interface PricedAddOn {
  itemId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
}

/**
 * Resolves and prices requested lines against the live, active catalogue —
 * never the price the client sent. Unlike a seat, a concession item is never
 * locked: there is no inventory to protect, only a price and an active flag
 * to re-check at the moment of charge, the same way a promo code is
 * re-evaluated at checkout rather than trusted from an earlier quote.
 */
export async function priceAddOns(db: Pick<Tx, 'concessionItem'>, lines: AddOnLine[]): Promise<PricedAddOn[]> {
  if (lines.length === 0) return [];

  // Two lines for the same item (a double-tap, a client bug) merge into one —
  // `BookingAddOn` has one row per item per booking, not per request line.
  const quantityByItem = new Map<string, number>();
  for (const line of lines) {
    quantityByItem.set(line.itemId, (quantityByItem.get(line.itemId) ?? 0) + line.quantity);
  }

  const items = await db.concessionItem.findMany({
    where: { id: { in: [...quantityByItem.keys()] }, active: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  const missing = [...quantityByItem.keys()].filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw HttpError.badRequest('One or more items are no longer available', {
      itemId: missing,
    });
  }

  // Every key in `quantityByItem` is already confirmed present in `byId` by
  // the check above, so `items` (not the map) is the safe thing to map over.
  return items.map((item) => ({
    itemId: item.id,
    name: item.name,
    quantity: quantityByItem.get(item.id) ?? 0,
    unitPriceMinor: item.priceMinor,
  }));
}

export function addOnsTotal(priced: PricedAddOn[]): number {
  return priced.reduce((sum, l) => sum + l.unitPriceMinor * l.quantity, 0);
}
