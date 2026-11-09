/**
 * The time of day, in the words somebody would actually use.
 *
 * Pure and exported so it can be tested rather than eyeballed at 3am. The
 * boundaries are the ones Indian English uses in practice: "evening" starts
 * when the working day ends rather than at sunset, which is what makes
 * "Friday evening" read as a plan instead of as a clock reading.
 *
 * Late night is deliberately its own answer. Somebody opening a ticketing app
 * at one in the morning is not having a morning, and greeting them with one is
 * the kind of small wrongness that makes software feel unattended.
 */
export type PartOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function partOfDay(at: Date): PartOfDay {
  const hour = at.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * "Friday evening", or "Late Friday" after ten.
 *
 * The day name is kept because it is the half that carries meaning: a Tuesday
 * evening and a Friday evening are different propositions, and the app is in
 * the business of the second one.
 *
 * After midnight the day is still named for the evening it belongs to. At
 * 1am on Saturday people say they are out on Friday night, and a label that
 * said "Late Saturday" would be technically right and socially wrong.
 */
export function whenItIs(at: Date = new Date()): string {
  const part = partOfDay(at);
  if (part === 'night') {
    const beforeDawn = at.getHours() < 5;
    const day = WEEKDAYS[(at.getDay() + (beforeDawn ? 6 : 0)) % 7];
    return `Late ${day}`;
  }
  return `${WEEKDAYS[at.getDay()]} ${part}`;
}
