import { BRAND_TINTS, brandInitials, brandTint } from '../brand-mark';

describe('brandInitials', () => {
  it('keeps an acronym whole, because that is the name', () => {
    // "PV" would be an abbreviation this chain has never used, and the word
    // somebody is scanning for is the one on the building.
    expect(brandInitials('PVR')).toBe('PVR');
    expect(brandInitials('INOX')).toBe('INOX');
    expect(brandInitials('AMB')).toBe('AMB');
  });

  it('takes one letter from an ordinary name', () => {
    expect(brandInitials('Cinépolis')).toBe('C');
    expect(brandInitials('Prasads')).toBe('P');
    expect(brandInitials('Independent')).toBe('I');
  });

  it('keeps the letter the brand actually starts with', () => {
    expect(brandInitials('Ärena')).toBe('Ä');
  });

  it('takes the first word of a name with several', () => {
    expect(brandInitials('Fun Republic')).toBe('F');
  });

  it('has something to draw for a name that is not one', () => {
    expect(brandInitials('')).toBe('—');
    expect(brandInitials('   ')).toBe('—');
  });
});

describe('brandTint', () => {
  it('gives a chain the same colour every time', () => {
    expect(brandTint('PVR')).toBe(brandTint('PVR'));
  });

  it('does not care how the name was typed', () => {
    expect(brandTint('PVR')).toBe(brandTint(' pvr '));
  });

  it('only ever answers a tint the theme has', () => {
    for (const brand of ['PVR', 'INOX', 'Cinépolis', 'AMB', 'Prasads', 'Luxe', 'Independent', '']) {
      expect(BRAND_TINTS).toContain(brandTint(brand));
    }
  });

  it('spreads the chains in this catalogue across most of the palette', () => {
    // "More than one" was the first bar here and it was useless: it passed
    // while four of these seven shared a colour and two colours went unused,
    // which is the grey wall again in two greys. Three of four is what the
    // list actually needs to read as a list.
    const used = new Set(
      ['PVR', 'INOX', 'Cinépolis', 'AMB', 'Prasads', 'Luxe', 'Independent'].map(brandTint),
    );
    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  it('does not put two neighbours in the list on the same colour', () => {
    // As the cinemas tab orders them: the first two cards were both amber,
    // which reads as a relationship the catalogue does not have.
    expect(brandTint('AMB')).not.toBe(brandTint('Cinépolis'));
  });
});
