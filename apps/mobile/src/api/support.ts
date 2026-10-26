import type { SupportAnswer, SupportTurn } from '@app/shared';
import { api } from './client';

export const supportApi = {
  /**
   * Ask the support agent something.
   *
   * The phone sends the question and the recent turns; the key lives on the
   * server and the phone never talks to a model directly. Anything
   * `EXPO_PUBLIC_` is inlined into this bundle in plain text, so a key on this
   * side would ship inside the APK.
   */
  ask: (message: string, history: SupportTurn[]) =>
    api.post<SupportAnswer>('/v1/support/ask', { message, history }),
};
