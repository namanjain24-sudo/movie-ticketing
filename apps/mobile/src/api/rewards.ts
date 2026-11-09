import type { ScratchCard, ScratchResult } from '@app/shared';
import { api } from './client';

export const rewardsApi = {
  cards: () => api.get<{ cards: ScratchCard[] }>('/v1/rewards').then((r) => r.cards),

  /**
   * Safe to repeat. A card already opened answers with the same prize rather
   * than an error, so a retry after a dropped connection shows the win again
   * instead of losing it.
   */
  scratch: (cardId: string) =>
    api.post<ScratchResult>(`/v1/rewards/${encodeURIComponent(cardId)}/scratch`, {}),
};
