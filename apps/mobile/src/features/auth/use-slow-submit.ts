import { useEffect, useState } from 'react';

/**
 * True once a submission has been running long enough to need explaining.
 *
 * Signing in or registering normally takes under a second. The exception is
 * the first request of the day against a free host, which sleeps after a
 * quarter of an hour and takes most of a minute to wake. The client now waits
 * for that rather than failing at fifteen seconds, which is right, but it
 * turns a fast tap into a spinner that sits there with no explanation.
 *
 * Three seconds is past anything a warm server does and well short of the
 * wake, so the line appears exactly when the wait stops looking normal.
 */
export function useSlowSubmit(submitting: boolean, afterMs = 3000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!submitting) return;
    const timer = setTimeout(() => setSlow(true), afterMs);
    // The reset lives in the cleanup rather than in the effect body: a
    // synchronous setState while the effect runs would cascade a second
    // render on every submit, and this one only has to happen when a
    // submission ends.
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [submitting, afterMs]);

  return slow;
}
