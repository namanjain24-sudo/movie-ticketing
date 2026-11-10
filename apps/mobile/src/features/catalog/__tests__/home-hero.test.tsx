import { HomeHero } from '../home-hero';
import { render } from '../../../test-utils';

/** A fixed hour, so the greeting above the headline does not move. */
const MORNING = new Date('2026-11-10T04:30:00.000Z');

const noop = () => {};

const hero = (props: { city?: string; count?: number }) => (
  <HomeHero {...props} now={MORNING} onPressCity={noop} onDiscover={noop} />
);

describe('HomeHero', () => {
  it('names the chosen city', async () => {
    const { getByText } = await render(hero({ city: 'Mumbai', count: 7 }));

    // Matched through the headline's own wording rather than the city name
    // alone: the chip underneath says Mumbai too.
    expect(getByText(/films on in\s+Mumbai/)).toBeTruthy();
  });

  it('says all cities when none is chosen, because none is filtering', async () => {
    // The count is every film on anywhere when no city is set, and the chip
    // directly below this reads "All cities". "Your city" claimed a local
    // number that was never local, and contradicted its own control.
    const { getByText, queryByText } = await render(hero({ count: 7 }));

    expect(getByText(/films on in\s+all cities/)).toBeTruthy();
    expect(queryByText(/your city/)).toBeNull();
  });

  it('counts films in the singular when there is one', async () => {
    const { getByText } = await render(hero({ city: 'Pune', count: 1 }));

    expect(getByText(/ film on in/)).toBeTruthy();
  });

  it('asks rather than counts while the number is still loading', async () => {
    // A zero would be a claim; a question is not.
    const { getByText } = await render(hero({ city: 'Pune' }));

    expect(getByText(/What's on in/)).toBeTruthy();
  });
});
