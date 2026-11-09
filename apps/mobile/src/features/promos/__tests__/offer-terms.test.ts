import type { PromoOffer } from '@app/shared';
import { offerTerms } from '../offer-terms';

const NOW = new Date('2026-11-10T12:00:00.000Z');

const offer = (over: Partial<PromoOffer> = {}): PromoOffer => ({
  code: 'FLAT100',
  description: '₹100 off',
  minSubtotalMinor: 0,
  expiresAt: null,
  ...over,
});

describe('offerTerms', () => {
  describe('the minimum spend', () => {
    it('is named, because checkout refusing the code is how people found out', () => {
      expect(offerTerms(offer({ minSubtotalMinor: 50_000 }), NOW).minimum).toBe('Min ₹500');
    });

    it('is absent when the offer has no floor', () => {
      expect(offerTerms(offer({ minSubtotalMinor: 0 }), NOW).minimum).toBe(null);
    });
  });

  describe('the expiry', () => {
    const at = (iso: string) => offerTerms(offer({ expiresAt: iso }), NOW);

    it('says today for something ending in hours', () => {
      expect(at('2026-11-10T20:00:00.000Z').expiry).toBe('Ends today');
    });

    it('says tomorrow rather than "in 1 day"', () => {
      expect(at('2026-11-11T14:00:00.000Z').expiry).toBe('Ends tomorrow');
    });

    it('counts days once it is further out', () => {
      expect(at('2026-11-14T12:00:00.000Z').expiry).toBe('Ends in 4 days');
    });

    it('stays quiet about an expiry that is not close', () => {
      // An offer running for three more months is not a reason to hurry, and
      // saying so on every card is noise.
      expect(at('2027-02-01T12:00:00.000Z').expiry).toBe(null);
    });

    it('is quiet when there is no expiry at all', () => {
      expect(offerTerms(offer({ expiresAt: null }), NOW).expiry).toBe(null);
    });

    it('marks an offer that has already run out', () => {
      const past = at('2026-11-09T12:00:00.000Z');
      expect(past.expired).toBe(true);
      expect(past.expiry).toBe(null);
    });

    it('treats the exact instant as expired, matching the server', () => {
      expect(at('2026-11-10T12:00:00.000Z').expired).toBe(true);
    });

    it('ignores a date the server could not have sent', () => {
      const broken = offerTerms(offer({ expiresAt: 'not-a-date' }), NOW);
      expect([broken.expiry, broken.expired]).toEqual([null, false]);
    });
  });

  it('reports both conditions together', () => {
    const terms = offerTerms(
      offer({ minSubtotalMinor: 30_000, expiresAt: '2026-11-11T18:00:00.000Z' }),
      NOW,
    );
    expect(terms).toEqual({ minimum: 'Min ₹300', expiry: 'Ends tomorrow', expired: false });
  });
});
