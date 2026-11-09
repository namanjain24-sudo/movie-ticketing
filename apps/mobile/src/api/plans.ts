import type { CreatePlanInput, Plan } from '@app/shared';
import { api } from './client';

export const plansApi = {
  /** The plans this account is in that have not happened yet. */
  mine: () => api.get<{ plans: Plan[] }>('/v1/plans').then((r) => r.plans),

  create: (input: CreatePlanInput) => api.post<Plan>('/v1/plans', input),

  /** Readable without an account, which is how a shared code is meant to work. */
  get: (code: string) => api.get<Plan>(`/v1/plans/${encodeURIComponent(code)}`),

  join: (code: string) => api.post<Plan>(`/v1/plans/${encodeURIComponent(code)}/join`, {}),

  /** Toggles one mark. The server decides which way; this only names the showing. */
  toggleVote: (code: string, optionId: string) =>
    api.post<Plan>(`/v1/plans/${encodeURIComponent(code)}/votes`, { optionId }),
};
