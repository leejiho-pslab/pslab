/**
 * 무인 데몬 "관리인" (설계도 무인 운영 3대 장치 中 ①)
 *
 * 항상 켜져 있다가, 각 클라이언트 설정표의 발행 시간(scheduleTimes)에 맞춰
 * 사이클을 자동으로 트리거한다. 사람이 "실행!" 하지 않아도 정해진 시각에
 * 알아서 한 바퀴 돈다.
 *
 * - tick(now): 한 번 점검 — 지금 시각에 예약된 클라이언트를 실행 (테스트/크론 친화)
 * - start(): 일정 간격으로 tick을 반복 (상주 모드)
 * - runOnce(): 모든 클라이언트를 즉시 한 사이클 (수동 트리거)
 *
 * 시각 비교는 서버 로컬 시간 기준(HH:mm)이다. 한국 시간으로 돌리려면
 * 프로세스 환경변수 TZ=Asia/Seoul 로 실행한다.
 */
import type { Orchestrator } from './orchestrator.js';
import type { ClientConfig } from './client.js';
import type { AlertHub } from './alerts.js';
import { createLogger } from './logger.js';

const log = createLogger('daemon');

export interface DaemonOptions {
  /** 점검 간격(ms). 기본 60초. */
  intervalMs?: number;
  alerts?: AlertHub;
  /** 사이클 완료 시 호출 (로그/상황판 갱신용) */
  onCycle?: (clientId: string, ok: boolean) => void;
}

/** "HH:mm" (서버 로컬) */
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 같은 분에 두 번 실행되지 않도록 하는 키 (로컬 날짜+시각) */
function fireKey(clientId: string, d: Date): string {
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${clientId}@${day}T${hhmm(d)}`;
}

export class AutomationDaemon {
  private timer?: ReturnType<typeof setInterval>;
  private readonly fired = new Set<string>();
  private busy = false;

  constructor(
    private readonly orchestrator: Orchestrator,
    private readonly clients: ClientConfig[],
    private readonly opts: DaemonOptions = {},
  ) {}

  /** 상주 모드 시작. 프로세스가 떠 있는 동안 간격마다 점검한다. */
  start(): void {
    const interval = this.opts.intervalMs ?? 60_000;
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick(new Date());
    }, interval);
    const schedule = this.clients
      .map((c) => `${c.name}:[${c.scheduleTimes.join(',')}]`)
      .join('  ');
    log.info(
      `🟢 관리인 가동 — 클라이언트 ${this.clients.length}곳, ${Math.round(interval / 1000)}s 간격 점검`,
    );
    log.info(`   시간표 ${schedule}`);
  }

  /** 상주 모드 정지. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    log.info('🔴 관리인 정지');
  }

  /**
   * 한 번 점검: now 시각에 예약된 클라이언트를 실행한다.
   * 실행된 클라이언트 id 목록을 반환한다.
   */
  async tick(now: Date): Promise<string[]> {
    const current = hhmm(now);
    const due = this.clients.filter(
      (c) => c.scheduleTimes.includes(current) && !this.fired.has(fireKey(c.id, now)),
    );
    if (due.length === 0) return [];

    // 같은 분 중복 방지 키를 먼저 찍는다 (간격이 분보다 짧아도 1회만).
    for (const c of due) this.fired.add(fireKey(c.id, now));

    const ran: string[] = [];
    for (const client of due) {
      ran.push(client.id);
      await this.safeRun(client);
    }
    return ran;
  }

  /** 모든 클라이언트를 즉시 한 사이클 실행한다 (수동/외부 크론 트리거용). */
  async runOnce(): Promise<void> {
    for (const client of this.clients) await this.safeRun(client);
  }

  /** 사이클 1회 — 예외를 흡수해 데몬이 죽지 않게 하고, 실패는 알림으로 보낸다. */
  private async safeRun(client: ClientConfig): Promise<void> {
    // 동시에 한 사이클씩만 (순차) — 자원 보호
    while (this.busy) await new Promise((r) => setTimeout(r, 20));
    this.busy = true;
    try {
      log.info(`⏰ 예약 트리거 — ${client.name}(${client.id})`);
      const rec = await this.orchestrator.runCycle(client);
      this.opts.onCycle?.(client.id, rec.published);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log.error(`사이클 실패 [${client.id}] — ${detail}`);
      await this.opts.alerts?.emit('error', '사이클 실패', {
        clientId: client.id,
        detail,
      });
      this.opts.onCycle?.(client.id, false);
    } finally {
      this.busy = false;
    }
  }
}
