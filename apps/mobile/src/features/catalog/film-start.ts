/**
 * When the film itself begins, as opposed to when the advertising does.
 *
 * The time on a ticket in this market is when the lights go down on the
 * commercials. The gap runs to twenty-odd minutes, and consumer commissions
 * have ruled on it more than once: a Bengaluru bench fined PVR and INOX a
 * lakh over twenty-five minutes of it and directed that tickets carry the
 * actual start of the film, and Hyderabad and Telangana benches have since
 * held the same, calling the delay a deficiency in service.
 *
 * This app already assumed the gap and never said so. `endsAt` has always
 * been the runtime plus twenty minutes, so it could tell somebody when they
 * would be free again and not when the thing they paid for would start.
 *
 * Null when there is nothing to disclose: a show with no advertising, or a
 * date that will not parse. Both are better said by saying nothing than by
 * printing a second time that is the same as the first, or `Invalid Date`.
 */
export function filmStartsAt(startsAt: string, adsMinutes: number): string | null {
  if (!Number.isFinite(adsMinutes) || adsMinutes <= 0) return null;
  const printed = Date.parse(startsAt);
  if (Number.isNaN(printed)) return null;
  return new Date(printed + Math.round(adsMinutes) * 60_000).toISOString();
}
