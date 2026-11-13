import Anthropic from '@anthropic-ai/sdk';
import { CALL_TIMEOUT_MS } from './plan';
import type { CallModel } from './plan';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 8000;

export class MissingKeyError extends Error {}

/** Removes the key from any text before it leaves this module (error messages, logs). */
export function redactKey(text: string, key: string | undefined = process.env.ANTHROPIC_API_KEY): string {
  const k = key?.trim();
  return k ? text.split(k).join('[redacted]') : text;
}

/**
 * The real model caller. Key from ANTHROPIC_API_KEY, model from PLANNER_AI_MODEL (default claude-sonnet-5-5).
 * Throws MissingKeyError when the key is unset. The key is never logged and never put in an error message.
 */
export function createAnthropicCaller(env: Record<string, string | undefined> = process.env): CallModel {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new MissingKeyError('ANTHROPIC_API_KEY is not set; the AI night plan needs it.');
  const model = env.PLANNER_AI_MODEL?.trim() || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey, timeout: CALL_TIMEOUT_MS, maxRetries: 0 });
  return async (messages) => {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const turns = messages.filter((m): m is typeof m & { role: 'user' | 'assistant' } => m.role !== 'system');
    try {
      const res = await client.messages.create({ model, max_tokens: MAX_TOKENS, system, messages: turns });
      return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    } catch (e) {
      throw new Error(redactKey(e instanceof Error ? e.message : String(e), apiKey));
    }
  };
}
