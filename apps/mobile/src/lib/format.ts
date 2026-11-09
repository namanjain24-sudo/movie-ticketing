/**
 * Date and time helpers. Every screen that shows a showtime goes through here,
 * so "7:30 pm" looks the same everywhere and the rules live in one place.
 */

const TIME = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const WEEKDAY = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });
const DAY = new Intl.DateTimeFormat('en-IN', { day: 'numeric' });
const MONTH_DAY = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'short' });

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso)).toLowerCase();
}

export function formatMonthDay(iso: string): string {
  return MONTH_DAY.format(new Date(iso));
}

/** `2h 28m`, from a whole number of minutes. */
export function formatRuntime(mins: number): string {
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export type CalendarDay = {
  /** `YYYY-MM-DD`, the form the showtimes endpoint expects. */
  value: string;
  weekday: string;
  day: string;
  month: string;
  isToday: boolean;
};

/** Local-date key, not `toISOString()`, which would shift the day in IST. */
export function toDateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The strip of selectable dates at the top of a movie's showtimes. */
export function upcomingDays(count: number, from: Date = new Date()): CalendarDay[] {
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(from);
    date.setDate(date.getDate() + offset);
    return {
      value: toDateKey(date),
      weekday: WEEKDAY.format(date),
      day: DAY.format(date),
      month: MONTH.format(date),
      isToday: offset === 0,
    };
  });
}

/**
 * Minutes until `iso`, floored at zero. Used for the "starts soon" hint; the
 * checkout countdown uses the server clock instead of this.
 */
export function minutesUntil(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - now.getTime()) / 60_000));
}

/**
 * How long ago something was written, in the coarsest unit that is still true.
 *
 * Reviews are the only place this is used, and a review does not get more
 * useful for being timestamped to the minute. "3 days ago" is what a reader
 * actually wants to know; past a month the exact date is more use than a
 * running count of weeks, so it switches.
 */
export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  // A clock skew between device and server can put "now" slightly in the
  // future. "in 4 seconds" on a review is a bug report; "just now" is not.
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;

  return MONTH_DAY.format(then);
}

/**
 * A countdown in words: "in 8m", "in 1h 20m", "now", "started 20m ago".
 *
 * "in 8m" reads as a countdown and "in 1h 20m" reads as a plan. Both are true,
 * and which one it is decides whether a row is worth hurrying for.
 *
 * It lives here rather than inside the one card that first needed it because a
 * saved ticket held up at a gate asks exactly the same question, and two
 * screens answering it in two different wordings is how an app starts to feel
 * like several apps. The backwards case is the gate's: a show whose start has
 * just passed is still the one being scanned.
 */
export function formatMinutesUntil(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 0) {
    const ago = -m;
    return ago < 60 ? `started ${ago}m ago` : `started ${Math.floor(ago / 60)}h ago`;
  }
  // "in 0m" is a clock reading, not a sentence.
  if (m === 0) return 'now';
  if (m < 60) return `in ${m}m`;
  return `in ${Math.floor(m / 60)}h ${m % 60}m`;
}

/**
 * Does this show finish on a later day than it started?
 *
 * Local dates, never UTC, and never by comparing the ISO strings. The seed's
 * last slot is 22:45 and a two-hour film runs to 00:45 — the same UTC day in
 * a positive-offset zone, the next day for everybody actually sitting there.
 * Asking Postgres gave "0 showtimes cross midnight" for a catalogue where one
 * in five does.
 */
export function endsNextDay(startsAt: string, endsAt: string): boolean {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return (
    end.getFullYear() !== start.getFullYear() ||
    end.getMonth() !== start.getMonth() ||
    end.getDate() !== start.getDate()
  );
}

/**
 * Joins words the way a sentence does: "F11", "F11 and F12", "F11, F12 and
 * F13". Commas alone read as a list of fragments where this is a clause, and
 * the screens that use it are already apologising for something.
 */
export function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
