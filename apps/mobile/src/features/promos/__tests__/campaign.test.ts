import { campaignSlogan } from '../campaign';

describe('campaignSlogan', () => {
  it('leads the offers this catalogue actually ships', () => {
    expect(campaignSlogan('WELCOME50')).toBe('First one’s on us.');
    expect(campaignSlogan('MOVIE20')).toBe('A fifth off the seats.');
    expect(campaignSlogan('FAMILY100')).toBe('Bring the whole row.');
  });

  it('does not care how the code was typed', () => {
    expect(campaignSlogan(' welcome50 ')).toBe(campaignSlogan('WELCOME50'));
  });

  it('says nothing for a code nobody has written a line for', () => {
    // The card then leads with its terms, which are always true. A slogan
    // invented for an offer nobody has read would be the one line on the
    // screen not checked against what it gives you.
    expect(campaignSlogan('SUMMER25')).toBeNull();
    expect(campaignSlogan('')).toBeNull();
  });

  it('leaves the exact figures to the terms, which the server states', () => {
    // "A fifth off the seats" is the campaign and it is true; "₹150" is the
    // cap and belongs in the line underneath, from the only source that
    // knows it. No slogan here carries a number, a rupee sign or a percent.
    for (const line of ['WELCOME50', 'MOVIE20', 'FAMILY100'].map(campaignSlogan)) {
      expect(line).not.toMatch(/[₹%\d]/);
    }
  });
});
