import type { PromoOffer, PromoQuote, PromoValidateInput } from '@app/shared';
import { api } from './client';

export const promosApi = {
  offers: () => api.get<{ offers: PromoOffer[] }>('/v1/promos').then((r) => r.offers),

  /**
   * A quote, not a reservation: the server checks again, under a lock, when the
   * booking is created. Read the result as "this would work right now".
   */
  validate: (input: PromoValidateInput) => api.post<PromoQuote>('/v1/promos/validate', input),
};
