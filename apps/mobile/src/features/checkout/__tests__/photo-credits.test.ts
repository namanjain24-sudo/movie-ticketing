import { photoCreditLine } from '../photo-credits';

const item = (imageUrl: string | null, imageCredit: string | null) => ({ imageUrl, imageCredit });

describe('photoCreditLine', () => {
  it('names every author, in the order the items appear', () => {
    expect(
      photoCreditLine([
        item('https://example.test/a.jpg', 'Briejones, CC BY-SA 3.0'),
        item('https://example.test/b.jpg', 'chee.hong, CC BY 2.0'),
      ]),
    ).toBe('Photos: Briejones, CC BY-SA 3.0 · chee.hong, CC BY 2.0 — via Wikimedia Commons');
  });

  it('names one author once, however many of their photographs are used', () => {
    expect(
      photoCreditLine([
        item('https://example.test/a.jpg', 'Muffet, CC BY 2.0'),
        item('https://example.test/b.jpg', 'Muffet, CC BY 2.0'),
      ]),
    ).toBe('Photos: Muffet, CC BY 2.0 — via Wikimedia Commons');
  });

  it('says nothing when no photograph is on screen', () => {
    // An empty "Photos:" is worse than silence, and a menu with no pictures
    // has nobody to credit.
    expect(photoCreditLine([])).toBeNull();
    expect(photoCreditLine([item(null, null)])).toBeNull();
  });

  it('ignores a picture whose credit went missing, which must not be drawn', () => {
    expect(photoCreditLine([item('https://example.test/a.jpg', null)])).toBeNull();
  });

  it('ignores a credit with no picture, which is nothing to account for', () => {
    expect(photoCreditLine([item(null, 'Somebody, CC BY 4.0')])).toBeNull();
  });
});
