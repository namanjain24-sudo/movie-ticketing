import type { ConcessionItem } from '@app/shared';
import { api } from './client';

export const concessionsApi = {
  list: () => api.get<{ items: ConcessionItem[] }>('/v1/concessions').then((r) => r.items),
};
