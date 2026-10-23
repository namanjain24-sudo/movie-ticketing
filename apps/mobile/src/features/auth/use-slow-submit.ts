import { useEffect, useState } from 'react';
import { isWakingServer, onWakeProgress } from '../../api/client';

/**
 * What to tell someone whose sign-in is taking a while.
 *
 * Two different slow things deserve different words. A sleeping host is the
 * common one on the free plan: it takes a minute or so, it is nobody's fault,
 * and it ends in success. Anything else slow is just slow.
 *
 * `null` means say nothing, which is the usual answer: signing in against a
 * warm server takes well under a second, and a reassurance that flashes up for
 * 300ms is worse than silence.
 */
export type SubmitHint = { kind: 'waking'; seconds: number } | { kind: 'slow' } | null;

const SLOW_AFTER_MS = 3000;

export function useSlowSubmit(submitting: boolean): SubmitHint {
  const [hint, setHint] = useState<SubmitHint>(null);

  useEffect(() => {
    if (!submitting) return;

    const started = Date.now();
    // The client says outright when it is waiting on a sleeping server, which
    // beats inferring it from how long this has taken.
    let waking = isWakingServer();

    const publish = () => {
      const elapsed = Date.now() - started;
      if (waking) setHint({ kind: 'waking', seconds: Math.round(elapsed / 1000) });
      else if (elapsed >= SLOW_AFTER_MS) setHint({ kind: 'slow' });
      else setHint(null);
    };

    const stopListening = onWakeProgress((attempt) => {
      waking = attempt > 0;
      publish();
    });
    // Once a second: enough to tick a counter, cheap enough to ignore.
    const ticker = setInterval(publish, 1000);

    return () => {
      stopListening();
      clearInterval(ticker);
      // In the cleanup rather than the effect body: a synchronous setState
      // while the effect runs cascades a second render on every submit.
      setHint(null);
    };
  }, [submitting]);

  return hint;
}
