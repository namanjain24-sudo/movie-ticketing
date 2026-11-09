import { ScreeningAccess } from '../screening-access';
import { render } from '../../../test-utils';

/**
 * The block on the booking page, which is where the Ministry's advisory
 * actually puts the obligation.
 */
describe('ScreeningAccess', () => {
  it('renders nothing when nothing is claimed', async () => {
    const { toJSON } = await render(<ScreeningAccess features={[]} via={null} />);

    // Checked through the test wrapper's own children rather than against
    // null: `render` mounts the providers every screen runs under, so the tree
    // is never empty even when the component under test draws nothing.
    //
    // Not an empty reassurance either. "No accessibility features" would be a
    // claim the catalogue has no basis for making.
    expect(toJSON()).toMatchObject({ children: [] });
  });

  it('names what the screening offers', async () => {
    const { getByText } = await render(
      <ScreeningAccess features={['AUDIO_DESCRIPTION', 'CLOSED_CAPTIONS']} via={null} />,
    );

    expect(getByText('Audio description and closed captions')).toBeTruthy();
  });

  it('names the app and asks for headphones', async () => {
    const { getByText } = await render(
      <ScreeningAccess features={['AUDIO_DESCRIPTION']} via="XL Cinema" />,
    );

    expect(getByText(/XL Cinema/)).toBeTruthy();
    expect(getByText(/bring headphones/)).toBeTruthy();
  });

  it('is one node to a screen reader, not an icon and two sentences', async () => {
    const { getByLabelText } = await render(
      <ScreeningAccess features={['AUDIO_DESCRIPTION']} via="XL Cinema" />,
    );

    expect(
      getByLabelText(
        'Audio description. Plays through XL Cinema on your own phone, so bring headphones and install it before you arrive.',
      ),
    ).toBeTruthy();
  });

  it('reads as a sentence when there is nothing to install', async () => {
    const { getByLabelText } = await render(
      <ScreeningAccess features={['CLOSED_CAPTIONS']} via={null} />,
    );

    expect(getByLabelText('This screening has Closed captions')).toBeTruthy();
  });
});
