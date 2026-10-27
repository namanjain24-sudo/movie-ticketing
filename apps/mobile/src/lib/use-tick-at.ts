import { useEffect, useMemo, useState } from 'react';

/**
 * A clock that re-reads itself when something is due, and at no other time.
 *
 * For values derived from data already in hand that go stale by the passing
 * of time alone — a showtime that stops selling, a hold that runs out. An
 * interval would work and would spend every tick of it being right about
 * nothing; this holds one timer and wakes once, when the answer changes.
 *
 * `nextAfter` is asked, from the clock this currently reads, when the next
 * thing is due. Each wake advances the clock, which moves the answer to the
 * one after it, and a list with nothing left to wait for answers null, which
 * ends the chain rather than leaving a timer open for the session.
 */
export function useTickAt(nextAfter: (now: number) => number | null): number {
  const [now, setNow] = useState(() => Date.now());
  const at = useMemo(() => nextAfter(now), [nextAfter, now]);

  useEffect(() => {
    if (at === null) return;
    // Forwards only. `at` is computed from this same clock, so an answer that
    // is already behind it means the caller broke its half of the bargain —
    // and waking a second later to be given it again, and again, is how that
    // mistake turns into a timer that never stops.
    if (at <= now) return;
    // A second past the instant, not on it: timers fire early often enough,
    // and waking to find the comparison still false would schedule the same
    // wake over again. A second late costs nothing here.
    const delay = Math.max(0, at - Date.now()) + 1_000;
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [at, now]);

  return now;
}
