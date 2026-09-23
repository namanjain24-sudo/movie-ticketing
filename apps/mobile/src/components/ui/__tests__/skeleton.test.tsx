import { render } from '@testing-library/react-native';
import { Skeleton } from '../skeleton';
import { ThemeProvider } from '../../../theme';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('Skeleton', () => {
  it('hides itself from a screen reader, since it stands for content that is not there yet', async () => {
    const { toJSON } = await wrap(<Skeleton style={{ width: 100, height: 20 }} />);
    const tree = toJSON();
    const node = Array.isArray(tree) ? tree[0] : tree;
    expect(node?.props.accessibilityElementsHidden).toBe(true);
    expect(node?.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('takes the size it is given', async () => {
    const { toJSON } = await wrap(<Skeleton style={{ width: 100, height: 20 }} />);
    const tree = toJSON();
    const node = Array.isArray(tree) ? tree[0] : tree;
    const style = Array.isArray(node?.props.style) ? node.props.style.flat() : [node?.props.style];
    expect(style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 100, height: 20 })]),
    );
  });
});
