import type { SeatMap, SeatMapSeat } from '@app/shared';
import { act, renderHook } from '@testing-library/react-native';
import { useSeatSelection } from '../use-seat-selection';

function seat(overrides: Partial<SeatMapSeat> & { id: string }): SeatMapSeat {
  return {
    rowLabel: 'A',
    number: 1,
    x: 0,
    y: 0,
    tier: 'STANDARD',
    priceMinor: 20000,
    accessible: false,
    status: 'AVAILABLE',
    ...overrides,
  };
}

function buildMap(seats: SeatMapSeat[], maxSeatsPerBooking = 3): SeatMap {
  return {
    showtimeId: 'show_1',
    movie: { id: 'm1', title: 'Film', posterUrl: '' },
    cinema: { id: 'c1', name: 'Cinema', city: 'Mumbai' },
    screen: { id: 's1', name: 'Screen 1', rowCount: 2, columnCount: 3 },
    startsAt: '2026-09-13T14:00:00.000Z',
    format: 'TWO_D',
    currency: 'INR',
    salesCloseAt: '2026-09-13T14:00:00.000Z',
    maxSeatsPerBooking,
    tiers: [{ tier: 'STANDARD', priceMinor: 20000, label: 'Standard' }],
    seats,
    serverTime: '2026-09-13T12:00:00.000Z',
  };
}

const A1 = seat({ id: 'a1', rowLabel: 'A', number: 1, x: 0, y: 0 });
const A2 = seat({ id: 'a2', rowLabel: 'A', number: 2, x: 1, y: 0 });
const A3 = seat({ id: 'a3', rowLabel: 'A', number: 3, x: 2, y: 0 });
const B1 = seat({ id: 'b1', rowLabel: 'B', number: 1, x: 0, y: 1 });
const SOLD = seat({ id: 'sold', rowLabel: 'B', number: 2, x: 1, y: 1, status: 'SOLD' });

describe('useSeatSelection', () => {
  it('groups seats into rows ordered by grid position', async () => {
    // Deliberately out of order: the server makes no ordering promise.
    const { result } = await renderHook(() => useSeatSelection(buildMap([B1, A2, A1])));

    expect(result.current.rows.map((row) => row.label)).toEqual(['A', 'B']);
    expect(result.current.rows[0].seats.map((s) => s.id)).toEqual(['a1', 'a2']);
  });

  it('selects and deselects an available seat', async () => {
    const { result } = await renderHook(() => useSeatSelection(buildMap([A1, A2])));

    await act(async () => {
      result.current.toggle(A1);
    });
    expect(result.current.selectedIds).toEqual(['a1']);
    expect(result.current.statusOf(A1)).toBe('SELECTED');

    await act(async () => {
      result.current.toggle(A1);
    });
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.statusOf(A1)).toBe('AVAILABLE');
  });

  it('refuses a seat that is already gone', async () => {
    const { result } = await renderHook(() => useSeatSelection(buildMap([A1, SOLD])));

    await act(async () => {
      result.current.toggle(SOLD);
    });

    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.rejection).toBe('UNAVAILABLE');
  });

  it('stops at the booking limit and says why', async () => {
    const { result } = await renderHook(() => useSeatSelection(buildMap([A1, A2, A3, B1], 3)));

    await act(async () => {
      result.current.toggle(A1);
    });
    await act(async () => {
      result.current.toggle(A2);
    });
    await act(async () => {
      result.current.toggle(A3);
    });
    expect(result.current.atLimit).toBe(true);

    await act(async () => {
      result.current.toggle(B1);
    });

    expect(result.current.selectedIds).toHaveLength(3);
    expect(result.current.selectedIds).not.toContain('b1');
    expect(result.current.rejection).toBe('LIMIT');
  });

  it('totals the selected seats', async () => {
    const pricey = seat({ id: 'p', x: 0, y: 2, priceMinor: 50000 });
    const { result } = await renderHook(() => useSeatSelection(buildMap([A1, pricey])));

    await act(async () => {
      result.current.toggle(A1);
    });
    await act(async () => {
      result.current.toggle(pricey);
    });

    expect(result.current.subtotalMinor).toBe(70000);
  });

  it('greys out seats lost to a conflict and drops them from the selection', async () => {
    const { result } = await renderHook(() => useSeatSelection(buildMap([A1, A2])));

    await act(async () => {
      result.current.toggle(A1);
    });
    await act(async () => {
      result.current.toggle(A2);
    });

    await act(async () => {
      result.current.markUnavailable(['a1']);
    });

    expect(result.current.selectedIds).toEqual(['a2']);
    expect(result.current.statusOf(A1)).toBe('UNAVAILABLE');
    expect(result.current.subtotalMinor).toBe(20000);
  });

  it('will not re-select a seat a conflict took away', async () => {
    const { result } = await renderHook(() => useSeatSelection(buildMap([A1])));

    await act(async () => {
      result.current.markUnavailable(['a1']);
    });
    await act(async () => {
      result.current.toggle(A1);
    });

    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.rejection).toBe('UNAVAILABLE');
  });

  it("treats the viewer's own held seats as selectable", async () => {
    const mine = seat({ id: 'mine', x: 0, y: 3, status: 'HELD_BY_YOU' });
    const { result } = await renderHook(() => useSeatSelection(buildMap([mine])));

    expect(result.current.statusOf(mine)).toBe('HELD_BY_YOU');

    await act(async () => {
      result.current.toggle(mine);
    });

    expect(result.current.selectedIds).toEqual(['mine']);
  });

  it('reports whether a tap was taken, so feedback can match it', async () => {
    const { result } = await renderHook(() => useSeatSelection(buildMap([A1, A2, A3, SOLD], 2)));

    let accepted: boolean | undefined;

    await act(async () => {
      accepted = result.current.toggle(A1);
    });
    expect(accepted).toBe(true);

    // Deselecting is still a tap the app took.
    await act(async () => {
      accepted = result.current.toggle(A1);
    });
    expect(accepted).toBe(true);

    await act(async () => {
      accepted = result.current.toggle(SOLD);
    });
    expect(accepted).toBe(false);

    await act(async () => {
      result.current.toggle(A1);
      result.current.toggle(A2);
    });
    await act(async () => {
      accepted = result.current.toggle(A3);
    });
    expect(accepted).toBe(false);
    expect(result.current.rejection).toBe('LIMIT');
  });

  it('orders the selection by seat position, not by tap order', async () => {
    const { result } = await renderHook(() => useSeatSelection(buildMap([A1, A2, B1])));

    await act(async () => {
      result.current.toggle(B1);
    });
    await act(async () => {
      result.current.toggle(A2);
    });
    await act(async () => {
      result.current.toggle(A1);
    });

    expect(result.current.selectedSeats.map((s) => s.id)).toEqual(['a1', 'a2', 'b1']);
  });

  describe('selectSeats', () => {
    it('replaces the selection with the given seats', async () => {
      const { result } = await renderHook(() => useSeatSelection(buildMap([A1, A2, A3])));
      await act(async () => {
        result.current.toggle(A1);
      });
      await act(async () => {
        result.current.selectSeats([A2, A3]);
      });
      expect(result.current.selectedIds.sort()).toEqual(['a2', 'a3']);
    });

    it('drops seats that cannot be selected', async () => {
      const { result } = await renderHook(() => useSeatSelection(buildMap([A1, SOLD])));
      await act(async () => {
        result.current.selectSeats([A1, SOLD]);
      });
      expect(result.current.selectedIds).toEqual(['a1']);
    });

    it('cannot get past the party size the user named', async () => {
      const { result } = await renderHook(() => useSeatSelection(buildMap([A1, A2, A3]), 2));
      await act(async () => {
        result.current.selectSeats([A1, A2, A3]);
      });
      expect(result.current.selectedIds).toHaveLength(2);
    });

    it('drops seats the server has since told us are gone', async () => {
      const { result } = await renderHook(() => useSeatSelection(buildMap([A1, A2])));
      await act(async () => {
        result.current.markUnavailable(['a1']);
      });
      await act(async () => {
        result.current.selectSeats([A1, A2]);
      });
      expect(result.current.selectedIds).toEqual(['a2']);
    });
  });
});
