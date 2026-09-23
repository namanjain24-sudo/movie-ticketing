# Seat map performance

The seat map is row- and column-virtualised React Native views today (see the
README's "How this is" section) — not a Skia canvas. That is a correct
approach, not a placeholder for one: on the seeded 2,080-seat IMAX house it
keeps the mounted cell count around 633 regardless of how far the map scrolls.
What has not been done is measuring it on a real device under the actual
performance target (60fps, a mid-range Android phone), which is why a Skia
rewrite is not on the roadmap yet — there is nothing to fix that has been
shown to need fixing.

This is not something this repo's own test suite or CI can produce: frame
timing and mounted-view counts are properties of a real device's GPU and JS
thread, not of a headless test runner. It needs to be run by hand, once, on
the hardware the target actually names.

## Running it

1. In `apps/mobile/src/features/seatmap/perf-log.ts`, flip `SEATMAP_PERF_LOG`
   to `true`. This is a local, one-line edit for a measurement session — it is
   not meant to ship flipped on.
2. Start the app on the target device (a mid-range Android phone, per the
   README's stated bar — not the simulator, which has no GPU/JS-thread
   contention to measure).
3. Open a showtime on one of the seed's two 2,080-seat IMAX screens (PVR ICON,
   Phoenix Palladium or Prasads IMAX, Necklace Road) — that house is the seat
   map's stated performance target, not the 300-seat Load Test Arena screen,
   which exists for the booking-concurrency load test instead.
4. Scroll the seat map in both directions — vertically through rows, and
   horizontally across the 62-column width — for at least a few seconds each,
   the way someone scanning for a block of seats actually would.
5. Watch the console. Two kinds of line appear once a second:
   - `[seatmap-perf] ~N seat cells mounted (R rows × C columns in the current
     window)` — updates whenever the visible window changes size. This is the
     number to compare against the claimed 633 for the IMAX house.
   - `[seatmap-perf] F frames, D dropped, last second` — a frame is counted
     dropped when the gap since the previous one exceeds 25ms (1.5× the 16.7ms
     budget for 60fps). `D` climbing during a fast scroll is the signal that
     would justify moving to Skia; `D` near zero while `N` stays close to 633
     means the current approach is already meeting the target and there is
     nothing here for a renderer change to buy.

## What a result means

- **Low dropped-frame count, mounted count near the expected windowed
  total**: the RN-views approach is meeting the target. Leave it; a Skia
  rewrite would trade Expo Go for a dev-client build (see the README and
  PRODUCT.md's constraint) for no measured benefit.
- **Dropped frames climb during a fast scroll**: worth profiling *why* before
  reaching for Skia — check whether it is JS-thread work (the column-window
  recompute in `SeatGrid`) or the UI thread (view mounting/unmounting churn at
  the FlatList's row boundaries) using the platform's own profiler
  (Android GPU rendering profiler / Instruments on iOS). Only the second case
  is actually what a Skia canvas would fix; the first is a JS-side
  optimisation regardless of renderer.

Revert the `SEATMAP_PERF_LOG` flag before committing — it is instrumentation
for a measurement session, not a standing feature.
