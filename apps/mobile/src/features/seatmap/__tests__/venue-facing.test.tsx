import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../../theme';
import { VenueFacing } from '../venue-facing';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

/**
 * The point of this component is that the picture agrees with the caption, so
 * the tests check both: the label the venue uses, and which shape was drawn
 * under it. The variants carry a testID rather than being told apart by node
 * type — a shape is what this component is for, so it is worth naming.
 */
describe('VenueFacing', () => {
  it('points a cinema at its screen, and draws the screen', async () => {
    const t = await wrap(<VenueFacing facing="FILM" />);
    expect(t.getByText('SCREEN THIS WAY')).toBeTruthy();
    expect(t.getByTestId('venue-screen')).toBeTruthy();
  });

  it('points a match at the pitch, and draws a ground', async () => {
    const t = await wrap(<VenueFacing facing="SPORT" />);
    expect(t.getByText('PITCH THIS WAY')).toBeTruthy();
    expect(t.getByTestId('venue-ground')).toBeTruthy();
  });

  it.each(['CONCERT', 'COMEDY', 'THEATRE'] as const)('draws a stage for %s', async (kind) => {
    const t = await wrap(<VenueFacing facing={kind} />);
    expect(t.getByText('STAGE THIS WAY')).toBeTruthy();
    expect(t.getByTestId('venue-stage')).toBeTruthy();
  });

  it('gives a workshop the front of the room rather than a stage', async () => {
    const t = await wrap(<VenueFacing facing="WORKSHOP" />);
    expect(t.getByText('FRONT OF ROOM')).toBeTruthy();
    expect(t.getByTestId('venue-screen')).toBeTruthy();
  });

  it('defaults to a cinema when nothing says otherwise', async () => {
    const t = await wrap(<VenueFacing />);
    expect(t.getByText('SCREEN THIS WAY')).toBeTruthy();
  });
});
