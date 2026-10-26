import { env } from '../env';
import { logger } from '../logger';

/**
 * Groq, for the support agent.
 *
 * Deliberately thin. There is no SDK here because the surface used is one
 * POST to an OpenAI-compatible endpoint, and a dependency that wraps one
 * `fetch` is a dependency that will need upgrading for no benefit.
 *
 * ## It must work with no key
 *
 * `RESEND_API_KEY` set the precedent and the reasoning is the same: this
 * project has to run from a fresh clone with no third-party account. So an
 * absent key is not an error, it is a mode. `answer()` returns `null`, the
 * caller falls back to what it can say from the grounded context alone, and
 * the chat tells the user which of the two it is rather than pretending.
 *
 * ## It must stay on this side
 *
 * Anything prefixed `EXPO_PUBLIC_` is inlined into the mobile bundle in plain
 * text — the API URL in the APK can be found with `unzip | grep`, and a key
 * would be just as findable. The phone never sees this key and never talks to
 * Groq; it talks to this API, which does.
 */
export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqAnswer {
  text: string;
  model: string;
}

/** Whether a key is configured at all, for the caller to tell the user. */
export function isGroqConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY);
}

/**
 * One completion, or `null` when there is no key or the call failed.
 *
 * Never throws. A support chat that 500s because somebody else's service is
 * having an afternoon is worse than one that answers from what it already
 * knows, and the caller has a grounded fallback either way.
 */
export async function answer(
  messages: ChatTurn[],
  options: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
): Promise<GroqAnswer | null> {
  if (!env.GROQ_API_KEY) return null;

  try {
    const res = await fetch(`${env.GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        messages,
        // Low rather than zero. This agent reads a context the server already
        // assembled; it is not being asked to be imaginative, and at zero the
        // same question gets a word-identical answer every time, which reads
        // as canned.
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 400,
        stream: false,
      }),
      // A support reply is read by somebody waiting, so the budget is short.
      // The caller still has something useful to say if this runs out.
      signal: options.signal ?? AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error(
        { status: res.status, detail: detail.slice(0, 300) },
        'Groq refused a support completion',
      );
      return null;
    }

    const body = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };

    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) {
      logger.error({ body: JSON.stringify(body).slice(0, 300) }, 'Groq returned no content');
      return null;
    }

    return { text, model: body.model ?? env.GROQ_MODEL };
  } catch (err) {
    logger.error({ err }, 'Groq call threw');
    return null;
  }
}
