import type { ConcessionItem } from '@app/shared';

/**
 * One line naming everybody whose photograph is on screen.
 *
 * The menu photographs come from Wikimedia Commons under CC BY and CC BY-SA.
 * Both licences require the author to be named wherever the work is used, so
 * this is not a nicety that can be dropped when the layout gets tight - it is
 * the condition the pictures are there under at all.
 *
 * One line rather than a caption under each row: five credits stacked through
 * a menu would be louder than the menu. Named in the order the items appear,
 * so somebody checking a particular picture can count along.
 *
 * Null when nothing on screen is credited, so a menu with no photographs says
 * nothing instead of leaving an empty "Photos:" behind.
 */
export function photoCreditLine(
  items: Pick<ConcessionItem, 'imageUrl' | 'imageCredit'>[],
): string | null {
  const credits: string[] = [];
  for (const item of items) {
    // Both or neither: a picture with no credit must not be drawn, so one
    // without a credit is one this line should never have to account for.
    if (!item.imageUrl || !item.imageCredit) continue;
    if (!credits.includes(item.imageCredit)) credits.push(item.imageCredit);
  }
  if (credits.length === 0) return null;
  return `Photos: ${credits.join(' · ')} — via Wikimedia Commons`;
}
