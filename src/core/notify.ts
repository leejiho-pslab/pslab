/**
 * 푸시 알림 (대시보드 업그레이드 기능 ③) — 텔레그램
 *
 * 발행 완료/주간 리포트를 텔레그램으로 보낸다. 설정이 없으면 조용히 비활성.
 * 환경변수:
 *   TELEGRAM_BOT_TOKEN  (@BotFather로 생성한 봇 토큰)
 *   TELEGRAM_CHAT_ID    (받는 사람/채널 chat id)
 */
import { createLogger } from './logger.js';

const log = createLogger('notify');

export interface Notifier {
  enabled(): boolean;
  send(text: string): Promise<boolean>;
}

/** 텔레그램 Bot API 알림. */
export class TelegramNotifier implements Notifier {
  private readonly token?: string;
  private readonly chatId?: string;

  constructor(token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_CHAT_ID) {
    this.token = token || undefined;
    this.chatId = chatId || undefined;
  }

  enabled(): boolean {
    return Boolean(this.token && this.chatId);
  }

  /** 메시지 전송. 성공하면 true. 비활성/실패면 false (예외 던지지 않음). */
  async send(text: string): Promise<boolean> {
    if (!this.enabled()) {
      log.info('텔레그램 미설정 — 푸시 생략');
      return false;
    }
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          }),
        },
      );
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        log.warn(`텔레그램 전송 실패: ${json.description ?? res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      log.warn(`텔레그램 전송 오류: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }
}

/** 환경 설정으로 기본 노티파이어를 만든다. */
export function createNotifier(): Notifier {
  return new TelegramNotifier();
}
