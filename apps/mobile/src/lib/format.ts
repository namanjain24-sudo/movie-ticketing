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
