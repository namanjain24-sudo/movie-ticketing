import { useEffect, useState } from 'react';
import { isWakingServer, onWakeProgress } from '../../api/client';

/**
 * What to tell someone whose sign-in is taking a while.
 *
 * Two different slow things deserve different words. A sleeping host is the
 * common one on the free plan: it is nobody's fault and it ends in success.
 * Anything else slow is just slow.
 *
 * `null` means say nothing, which is the usual answer: signing in against a
 * warm server takes well under a second, and a reassurance that flashes up for
 * 300ms is worse than silence.
 */
export type SubmitHint = {
  kind: 'waking' | 'slow';
  seconds: number;
  /** Ready to render. Four screens show this; none of them should phrase it. */
  message: string;
} | null;

const SLOW_AFTER_MS = 3000;

/**
 * The words, which have to keep being true as the wait gets longer.
 *
 * Every screen used to hard-code "this takes about a minute and then it
 * works". On the good cold start that is accurate. On the bad one — 328
 * seconds, measured on this deployment — it is a line the app repeats for four
 * more minutes after it stopped being true, which is how a patient person
 * decides the app is lying to them and closes it. So it escalates: a promise
 * at first, an admission afterwards, and never a number it cannot keep.
 */
export function wakeMessage(seconds: number): string {
  if (seconds < 75) {
    return `Waking the server, ${seconds}s. The free plan sleeps when nobody is using it; this usually takes about a minute.`;
  }
  if (seconds < 180) {
    return `Still waking the server, ${seconds}s. A free host can take a few minutes to start when it has been asleep a while. Nothing is wrong, and it is still trying.`;
  }
  return `Still waking the server, ${seconds}s. This is the slow end of what the free plan does. It will keep trying for a few more minutes — you can leave this screen and come back.`;
}

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
      const seconds = Math.round(elapsed / 1000);
      if (waking) setHint({ kind: 'waking', seconds, message: wakeMessage(seconds) });
      else if (elapsed >= SLOW_AFTER_MS)
        setHint({ kind: 'slow', seconds, message: 'Still going. One moment.' });
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
