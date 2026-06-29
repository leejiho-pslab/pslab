/**
 * Claude 호출 공용 헬퍼 (인사이트 코멘트·주간 리포트용)
 *
 * ANTHROPIC_API_KEY가 있으면 Claude로 텍스트를 생성하고, 실패하면 undefined를
 * 반환해 호출부가 규칙기반으로 폴백하도록 한다. (SDK는 동적 import)
 */
import { createLogger } from './logger.js';

const log = createLogger('claude');
const DEFAULT_MODEL = process.env.PSLAB_CLAUDE_MODEL ?? 'claude-opus-4-8';

/** 환경에 ANTHROPIC_API_KEY가 있으면 그 키를 반환. */
export function claudeKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || undefined;
}

/**
 * Claude로 짧은 한국어 텍스트를 생성한다. 키가 없거나 실패하면 undefined.
 */
export async function claudeText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  apiKey?: string;
}): Promise<string | undefined> {
  const apiKey = opts.apiKey ?? claudeKey();
  if (!apiKey) return undefined;
  try {
    const pkg = '@anthropic-ai/sdk';
    const mod: any = await import(pkg as string);
    const Anthropic = mod.default ?? mod.Anthropic;
    const ai = new Anthropic({ apiKey });
    const res: any = await ai.messages.create({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 1200,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
    });
    const text = (res.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim();
    return text || undefined;
  } catch (err) {
    log.warn(`Claude 호출 실패 → 폴백 (${err instanceof Error ? err.message : err})`);
    return undefined;
  }
}
