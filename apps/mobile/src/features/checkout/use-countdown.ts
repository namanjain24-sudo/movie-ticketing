import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Counts down to a server-issued deadline.
 *
 * The device clock is not trusted: a phone whose time is wrong by two minutes
 * would otherwise show a hold as expired while the server still honours it, or
 * worse, show time remaining on a hold that is already gone. Instead the
 * server's own `serverTime` is compared against the local clock once, and that
 * offset is applied to every tick. Only the *elapsed* local time is used after
 * that, which is accurate even when the absolute time is not.
 *
 * `useLayoutEffect`, not `useEffect`, computes the first tick. This hook is
 * called again the instant `hold.data` resolves, going from
 * `expiresAt === undefined` to a real deadline in one render. A plain
 * `useEffect` commits that render (with `remainingMs` still at its old
 * default) and paints it before the effect corrects it, so the screen flashes
 * "expired" for a frame on a hold that is perfectly valid. A layout effect
 * runs before the screen paints, so the correction lands in the same frame.
 */
export function useCountdown(expiresAt: string | undefined, serverTime: string | undefined) {
  const offsetRef = useRef(0);
  const [remainingMs, setRemainingMs] = useState(0);

  useLayoutEffect(() => {
    if (!serverTime) return;
    offsetRef.current = new Date(serverTime).getTime() - Date.now();
  }, [serverTime]);

  useLayoutEffect(() => {
    if (!expiresAt) return;

    const deadline = new Date(expiresAt).getTime();
    const tick = () => setRemainingMs(Math.max(0, deadline - (Date.now() + offsetRef.current)));

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const totalSeconds = Math.ceil(remainingMs / 1000);

  return {
    remainingMs,
    hasExpired: expiresAt !== undefined && remainingMs <= 0,
    /** `4:37`, the shape a countdown is read in. */
    label: `${Math.floor(totalSeconds / 60)}:${`${totalSeconds % 60}`.padStart(2, '0')}`,
    /** True in the last minute, when the countdown should start to alarm. */
    isUrgent: remainingMs > 0 && remainingMs <= 60_000,
  };
}
