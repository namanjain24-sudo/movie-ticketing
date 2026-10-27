import type { SeatMapSeat } from '@app/shared';
import { render, userEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../../../theme';
import { AccessibleSeats } from '../accessible-seats';
import type { SeatRenderStatus, SeatRow } from '../use-seat-selection';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const seat = (
  id: string,
  y: number,
  accessible: boolean,
  status: SeatRenderStatus = 'AVAILABLE',
): SeatMapSeat & { _status: SeatRenderStatus } =>
  ({
    id,
    rowLabel: `R${y}`,
    number: Number(id.replace(/\D/g, '')) || 1,
    x: 1,
    y,
    tier: 'STANDARD',
    priceMinor: 20000,
    accessible,
    status: 'AVAILABLE',
    _status: status,
  }) as never;

const statusOf = (s: SeatMapSeat) => (s as never as { _status: SeatRenderStatus })._status;

const rowsFrom = (seats: (SeatMapSeat & { _status: SeatRenderStatus })[]): SeatRow[] => {
  const byY = new Map<number, SeatMapSeat[]>();
  for (const s of seats) byY.set(s.y, [...(byY.get(s.y) ?? []), s]);
  return [...byY.entries()].map(([y, rowSeats]) => ({ y, label: `R${y}`, seats: rowSeats }));
};

describe('AccessibleSeats', () => {
  it('says nothing at all in a room with no wheelchair spaces', async () => {
    const seats = [seat('a1', 0, false), seat('a2', 0, false)];
    const { queryByRole } = await wrap(
      <AccessibleSeats
        rows={rowsFrom(seats)}
        seats={seats}
        statusOf={statusOf}
        onJump={jest.fn()}
      />,
    );
    // A control reading "0 spaces" on every ordinary cinema is noise
    // everywhere and a promise nowhere.
    expect(queryByRole('button')).toBeNull();
  });

  it('counts only the free ones, against the room total', async () => {
    const seats = [
      seat('w1', 2, true, 'AVAILABLE'),
      seat('w2', 2, true, 'SOLD'),
      seat('w3', 5, true, 'AVAILABLE'),
      seat('n1', 1, false),
    ];
    const { getByLabelText } = await wrap(
      <AccessibleSeats
        rows={rowsFrom(seats)}
        seats={seats}
        statusOf={statusOf}
        onJump={jest.fn()}
      />,
    );
    expect(getByLabelText('2 of 3 wheelchair spaces free. Show them on the map.')).toBeTruthy();
  });

  it('jumps to the first row that still has one open, not merely the first', async () => {
    const user = userEvent.setup();
    const onJump = jest.fn();
    const seats = [
      // Row 2 has a space, but it is gone. The jump should skip it.
      seat('w1', 2, true, 'SOLD'),
      seat('w2', 7, true, 'AVAILABLE'),
      seat('n1', 1, false),
    ];
    const { getByRole } = await wrap(
      <AccessibleSeats rows={rowsFrom(seats)} seats={seats} statusOf={statusOf} onJump={onJump} />,
    );
    await user.press(getByRole('button'));
    expect(onJump).toHaveBeenCalledWith(7);
  });

  it('stays visible but inert once every space is taken', async () => {
    const onJump = jest.fn();
    const seats = [seat('w1', 2, true, 'SOLD'), seat('n1', 1, false)];
    const { getByLabelText } = await wrap(
      <AccessibleSeats rows={rowsFrom(seats)} seats={seats} statusOf={statusOf} onJump={onJump} />,
    );
    // Still says so: "there are none left" and "this room has none" are very
    // different answers and the person asking needs to tell them apart.
    expect(getByLabelText('All 1 wheelchair spaces in this room are taken')).toBeTruthy();
  });
});
