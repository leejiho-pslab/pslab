/**
 * 고장 알림벨 (설계도 무인 운영 3대 장치 中 ②)
 *
 * 연결 끊김·발행 실패 등 사람이 알아야 할 일을 알린다.
 * 기본은 콘솔 출력. 실제 운영에선 Slack/이메일 싱크를 주입한다.
 */
import { createLogger } from './logger.js';

const log = createLogger('alerts');

export type AlertLevel = 'info' | 'warn' | 'error';

export interface Alert {
  level: AlertLevel;
  title: string;
  detail?: string;
  /** 관련 클라이언트 (있으면) */
  clientId?: string;
  at: string;
}

/** 알림 전송 대상. Slack/이메일/Webhook 등으로 구현해 주입한다. */
export interface AlertSink {
  send(alert: Alert): Promise<void>;
}

/** 콘솔로 출력하는 기본 싱크 */
export class ConsoleAlertSink implements AlertSink {
  async send(alert: Alert): Promise<void> {
    const icon = alert.level === 'error' ? '🚨' : alert.level === 'warn' ? '⚠️' : 'ℹ️';
    const who = alert.clientId ? `[${alert.clientId}] ` : '';
    log.info(`${icon} ${who}${alert.title}${alert.detail ? ` — ${alert.detail}` : ''}`);
  }
}

/** 여러 싱크로 알림을 동시에 보내는 허브 */
export class AlertHub {
  private readonly sinks: AlertSink[];

  constructor(sinks: AlertSink[] = [new ConsoleAlertSink()]) {
    this.sinks = sinks;
  }

  addSink(sink: AlertSink): void {
    this.sinks.push(sink);
  }

  async emit(
    level: AlertLevel,
    title: string,
    opts: { detail?: string; clientId?: string } = {},
  ): Promise<void> {
    const alert: Alert = {
      level,
      title,
      detail: opts.detail,
      clientId: opts.clientId,
      at: new Date().toISOString(),
    };
    await Promise.allSettled(this.sinks.map((s) => s.send(alert)));
  }
}
