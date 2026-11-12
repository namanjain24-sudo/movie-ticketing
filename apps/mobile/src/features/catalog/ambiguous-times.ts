import type { ShowtimeSummary } from '@app/shared';

/**
 * Which showings in a cinema's day cannot be told apart by their time alone.
 *
 * A cinema runs a big release on four screens at once, so a day's listing for
 * it is four chips reading "4:45 pm · 2D · Hindi · ₹220 onwards" - identical
 * down to the price, because they are the same film at the same minute for
 * the same money. They are four different rooms with four different seat maps
 * and four different amounts left, and the list looked like it had printed
 * one chip four times by mistake.
 *
 * Only the ones that clash. Naming the auditorium on every chip would put a
 * room number on a hundred rows to disambiguate eight of them, and a label
 * that is on everything tells you nothing.
 *
 * Grouped by the whole visible face of the chip rather than by start alone:
 * two showings at 4:45, one in 2D and one in IMAX, already read as different
 * things and need no help.
 */
export function ambiguousShowtimeIds(
  showtimes: Pick<ShowtimeSummary, 'id' | 'startsAt' | 'format' | 'language'>[],
): Set<string> {
  const byFace = new Map<string, string[]>();
  for (const slot of showtimes) {
    const face = `${slot.startsAt}|${slot.format}|${slot.language}`;
    byFace.set(face, [...(byFace.get(face) ?? []), slot.id]);
  }

  const ambiguous = new Set<string>();
  for (const ids of byFace.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) ambiguous.add(id);
  }
  return ambiguous;
}
