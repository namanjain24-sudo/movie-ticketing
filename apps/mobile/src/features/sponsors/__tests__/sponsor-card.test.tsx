import { Linking } from 'react-native';
import { SponsorCard } from '../sponsor-card';
import { SPONSORS, sponsorById } from '../sponsors';
import { render, userEvent } from '../../../test-utils';

/**
 * A fake player, standing in for the native one.
 *
 * Jest has no video decoder and no native module, so `expo-video` is replaced
 * wholesale. What is worth asserting here is not that a frame decoded — that
 * is the platform's job and was checked by hand on a device — but that the
 * card plays only when it is told to, and that the honest labelling and the
 * link are where they should be.
 */
// `mock` prefix is not a style choice: jest hoists `jest.mock` above the
// file's own declarations and refuses a factory that closes over anything
// else.
const mockPlayer = { play: jest.fn(), pause: jest.fn(), loop: false, muted: false, volume: 1 };

jest.mock('expo-video', () => ({
  useVideoPlayer: (_source: unknown, setup: (p: typeof mockPlayer) => void) => {
    setup(mockPlayer);
    return mockPlayer;
  },
  VideoView: 'VideoView',
}));

// Only `useEventListener` is replaced. Mocking the whole `expo` module took
// `requireOptionalNativeModule` with it, which every other Expo package in
// the tree calls on import — the failure surfaced in expo-haptics, three
// imports away from anything to do with video.
jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  useEventListener: jest.fn(),
}));

const archforge = sponsorById('archforge')!;

describe('SponsorCard', () => {
  beforeEach(() => {
    mockPlayer.play.mockClear();
    mockPlayer.pause.mockClear();
  });

  it('says it is a house ad, on the card and not only in the film', async () => {
    const view = await render(<SponsorCard sponsor={archforge} />);

    // The slot looks exactly like a paid placement and is not one, so this
    // label is load-bearing rather than decorative.
    expect(view.getByText('HOUSE AD')).toBeTruthy();
    expect(view.getByText('ArchForge')).toBeTruthy();
  });

  it('shows the blurb and the link in full, and only the kicker when compact', async () => {
    const full = await render(<SponsorCard sponsor={archforge} />);
    expect(full.getByText(archforge.blurb)).toBeTruthy();
    expect(full.getByText('Try it live')).toBeTruthy();

    const compact = await render(<SponsorCard sponsor={archforge} compact />);
    expect(compact.getByText(archforge.kicker)).toBeTruthy();
    expect(compact.queryByText(archforge.blurb)).toBeNull();
  });

  it('opens the project when there is a url', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const user = userEvent.setup();
    const view = await render(<SponsorCard sponsor={archforge} />);

    await user.press(view.getByText('ArchForge'));

    expect(openURL).toHaveBeenCalledWith('https://archforge.vercel.app');
    openURL.mockRestore();
  });

  it('is inert when a sponsor has nothing to open', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const hindsight = sponsorById('hindsight')!;
    expect(hindsight.url).toBeUndefined();

    const user = userEvent.setup();
    const view = await render(<SponsorCard sponsor={hindsight} />);
    await user.press(view.getByText('Hindsight'));

    // Rather than opening nothing, or worse, a made-up address.
    expect(openURL).not.toHaveBeenCalled();
    expect(view.getByText('Research project')).toBeTruthy();
    openURL.mockRestore();
  });

  it('prefers an explicit handler over the link', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const onPress = jest.fn();
    const user = userEvent.setup();
    const view = await render(<SponsorCard sponsor={archforge} onPress={onPress} />);

    await user.press(view.getByText('ArchForge'));

    expect(onPress).toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it('plays only while it is the active slot', async () => {
    await render(<SponsorCard sponsor={archforge} active />);
    expect(mockPlayer.play).toHaveBeenCalled();

    mockPlayer.play.mockClear();
    await render(<SponsorCard sponsor={archforge} active={false} />);

    // A film decoding behind four screens of scroll is battery spent on
    // something nobody is looking at.
    expect(mockPlayer.play).not.toHaveBeenCalled();
    expect(mockPlayer.pause).toHaveBeenCalled();
  });

  it('sets the player up muted and looping', async () => {
    await render(<SponsorCard sponsor={archforge} />);
    expect(mockPlayer.loop).toBe(true);
    expect(mockPlayer.muted).toBe(true);
    expect(mockPlayer.volume).toBe(0);
  });

  it('describes itself to a screen reader as an ad, not as a film', async () => {
    const view = await render(<SponsorCard sponsor={archforge} />);
    expect(view.getByLabelText(/House ad\. ArchForge/)).toBeTruthy();
  });

  it('renders every sponsor without a missing field', async () => {
    for (const sponsor of SPONSORS) {
      const view = await render(<SponsorCard sponsor={sponsor} />);
      expect(view.getByText(sponsor.name)).toBeTruthy();
      expect(view.getByText(sponsor.note)).toBeTruthy();
    }
  });
});
