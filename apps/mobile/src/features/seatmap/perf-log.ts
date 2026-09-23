/**
 * Dev-only instrumentation for measuring the seat map's virtualisation on a
 * real device — see docs/seatmap-performance.md for how to run it and what
 * to look for. Off by default: flipping this to `true` is a one-line local
 * edit for a measurement session, not something that ships.
 */
export const SEATMAP_PERF_LOG = false;

let frameCount = 0;
let droppedFrames = 0;
let windowStartMs = 0;
let lastFrameMs = 0;
let started = false;

function tick() {
  const now = performance.now();
  if (lastFrameMs) {
    frameCount += 1;
    // 60fps budgets ~16.7ms/frame; call anything past 1.5x that dropped.
    if (now - lastFrameMs > 25) droppedFrames += 1;
  }
  lastFrameMs = now;

  if (now - windowStartMs >= 1000) {
    // eslint-disable-next-line no-console
    console.log(`[seatmap-perf] ${frameCount} frames, ${droppedFrames} dropped, last second`);
    frameCount = 0;
    droppedFrames = 0;
    windowStartMs = now;
  }
  requestAnimationFrame(tick);
}

/** Starts a running frame-rate log. Call once; it self-schedules from there. */
export function startSeatmapPerfLog() {
  if (!__DEV__ || !SEATMAP_PERF_LOG || started) return;
  started = true;
  windowStartMs = performance.now();
  requestAnimationFrame(tick);
}

/** Logs the current mounted-cell count whenever the visible window changes. */
export function logMountedSeatCount(visibleRows: number, columnsInView: number) {
  if (!__DEV__ || !SEATMAP_PERF_LOG) return;
  // eslint-disable-next-line no-console
  console.log(
    `[seatmap-perf] ~${visibleRows * columnsInView} seat cells mounted ` +
      `(${visibleRows} rows × ${columnsInView} columns in the current window)`,
  );
}
