import { z } from 'zod';

/**
 * The in-app support agent.
 *
 * The phone sends a question and the recent turns; the server assembles a
 * grounded context from the database and answers. The model's key never
 * leaves the server — anything `EXPO_PUBLIC_` is inlined into the bundle in
 * plain text, so a key on this side would ship to every phone.
 */
export const supportTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2_000),
});
export type SupportTurn = z.infer<typeof supportTurnSchema>;

export const supportAskSchema = z.object({
  message: z.string().trim().min(1).max(1_000),
  /**
   * Recent turns, oldest first. Capped here as well as on the server: a
   * client that sent a thousand turns would otherwise be asking this account
   * to pay for a thousand turns of context on every message.
   */
  history: z.array(supportTurnSchema).max(20).default([]),
});
export type SupportAsk = z.infer<typeof supportAskSchema>;

export const supportAnswerSchema = z.object({
  text: z.string(),
  /**
   * Which of the two answered.
   *
   * `model` is the language model reading the server's context.
   * `grounded` is the server answering directly, because no API key is
   * configured — the feature still works from a fresh clone.
   * `grounded-fallback` is the same answer, but because the model was
   * configured and did not respond. Distinguished so a screen can say
   * "briefly, while the assistant is unavailable" rather than quietly
   * passing off the short answer as the considered one.
   */
  source: z.enum(['model', 'grounded', 'grounded-fallback']),
});
export type SupportAnswer = z.infer<typeof supportAnswerSchema>;
