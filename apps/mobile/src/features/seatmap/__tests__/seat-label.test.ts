import type { SeatMapSeat } from '@app/shared';
import { seatAccessibilityLabel } from '../seat-grid';

const seat = (over: Partial<SeatMapSeat> = {}) =>
  ({
    rowLabel: 'G',
    number: 8,
    tier: 'STANDARD',
    priceMinor: 22_000,
    accessible: false,
    ...over,
  }) as SeatMapSeat;

/**
 * The only description of a seat some people ever get. The Delhi High Court's
 * finding about ticketing platforms was precisely that a disabled person
 * cannot book on them independently, and a seat that will not say what it
 * costs is a small version of that.
 */
describe('seatAccessibilityLabel', () => {
  it('names the row, the seat, the band and the price', () => {
    expect(seatAccessibilityLabel(seat(), 'AVAILABLE', 'INR')).toBe('Row G seat 8, Standard, ₹220');
  });

  it('says the price of a dearer band, which is the whole point', () => {
    // The tier header above the block carries this for anybody who can see
    // it. Swiping seat to seat, this is the only place it appears.
    const label = seatAccessibilityLabel(
      seat({ tier: 'RECLINER', priceMinor: 600_000 }),
      'AVAILABLE',
      'INR',
    );
    expect(label).toContain('₹6,000');
    expect(label).not.toBe('Row G seat 8, Standard, ₹220');
  });

  it('says when a seat cannot be taken', () => {
    expect(seatAccessibilityLabel(seat(), 'SOLD', 'INR')).toContain(', unavailable');
  });

  it.each(['AVAILABLE', 'SELECTED', 'HELD_BY_YOU'] as const)(
    'does not call a %s seat unavailable',
    (status) => {
      expect(seatAccessibilityLabel(seat(), status, 'INR')).not.toContain('unavailable');
    },
  );

  it('mentions a wheelchair space', () => {
    expect(seatAccessibilityLabel(seat({ accessible: true }), 'AVAILABLE', 'INR')).toContain(
      'wheelchair accessible',
    );
  });

  it('keeps the order: where it is, what it costs, then what is true of it', () => {
    // Position first, because that is what somebody is navigating by; the
    // price before the caveats, because it is the thing that decides.
    const label = seatAccessibilityLabel(seat({ accessible: true }), 'SOLD', 'INR');
    expect(label).toBe('Row G seat 8, Standard, ₹220, wheelchair accessible, unavailable');
  });
});
