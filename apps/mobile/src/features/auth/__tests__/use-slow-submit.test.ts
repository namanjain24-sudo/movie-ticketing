import { wakeMessage } from '../use-slow-submit';
import { config } from '../../../lib/config';

/**
 * The words a person stares at while a free host starts, and the budget that
 * decides whether they ever get an answer.
 *
 * Both exist because of one measurement. The same deployment cold-started in
 * 55 seconds one afternoon and 328 seconds the same evening, with the TCP
 * connection accepted instantly both times and the HTTP response simply
 * withheld while the instance booted. A 150 second budget sat between those
 * two numbers, which is the worst place for it to sit: on the slow start it
 * stopped waiting, let the sign-in POST go out against a server that was
 * still booting, and — since a mutation is never retried — failed outright,
 * telling the user their connection was broken roughly forty seconds before
 * the server would have answered.
 */
describe('the wake budget', () => {
  const WORST_OBSERVED_MS = 328_000;

  it('outlasts the slowest cold start actually measured', () => {
    expect(config.wakeBudgetMs).toBeGreaterThan(WORST_OBSERVED_MS);
  });

  it('leaves real headroom rather than scraping past it', () => {
    // Twice the worst case, because the worst case is a sample, not a bound.
    expect(config.wakeBudgetMs).toBeGreaterThanOrEqual(WORST_OBSERVED_MS * 1.25);
  });

  it('keeps probing often enough to notice the moment it comes up', () => {
    const perCycle = config.wakeProbeTimeoutMs + config.wakeProbeGapMs;
    expect(perCycle).toBeLessThanOrEqual(15_000);
    // And the budget is worth many cycles, not two or three.
    expect(config.wakeBudgetMs / perCycle).toBeGreaterThan(20);
  });
});

describe('wakeMessage', () => {
  it('always says how long it has been waiting', () => {
    for (const s of [1, 40, 74, 75, 120, 179, 180, 300, 419]) {
      expect(wakeMessage(s)).toContain(`${s}s`);
    }
  });

  /**
   * The line every screen used to hard-code. It is true at forty seconds and
   * a lie at four minutes, and an app that repeats a lie for four minutes is
   * how a patient person decides it is broken and closes it.
   */
  it('stops promising "about a minute" once a minute has clearly passed', () => {
    expect(wakeMessage(40)).toMatch(/about a minute/i);
    expect(wakeMessage(120)).not.toMatch(/about a minute/i);
    expect(wakeMessage(300)).not.toMatch(/about a minute/i);
  });

  it('escalates rather than repeating itself', () => {
    const early = wakeMessage(30);
    const middle = wakeMessage(120);
    const late = wakeMessage(300);
    expect(new Set([early, middle, late]).size).toBe(3);
  });

  it('admits it is slow without claiming anything is broken', () => {
    const late = wakeMessage(300);
    expect(late).toMatch(/free plan/i);
    expect(late).not.toMatch(/error|failed|broken|wrong/i);
  });

  it('never claims to have given up while it is still trying', () => {
    // The last band runs to the end of the budget.
    const atTheEnd = wakeMessage(Math.floor(config.wakeBudgetMs / 1000) - 1);
    expect(atTheEnd).toMatch(/still trying|keep trying|still waking/i);
  });
});
