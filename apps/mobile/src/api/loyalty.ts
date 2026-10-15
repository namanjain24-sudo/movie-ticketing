import type { LoyaltyBalance, LoyaltyQuote, LoyaltyRedeemInput } from '@app/shared';
import { api } from './client';

export const loyaltyApi = {
  balance: () => api.get<LoyaltyBalance>('/v1/loyalty/balance'),

  /**
   * A quote, not a reservation: the server checks again, under a lock, when
   * the booking is created. Read the result as "this would work right now".
   */
  quote: (input: LoyaltyRedeemInput) => api.post<LoyaltyQuote>('/v1/loyalty/quote', input),
};
