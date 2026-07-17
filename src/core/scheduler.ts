import type { Publisher, MultiPublishResult, PublishOptions } from './publisher.js';
import type { PostContent } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('scheduler');

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'canceled';

export interface ScheduledJob {
  id: string;
  /** 발행 예정 시각 */
  runAt: Date;
  content: PostContent;
  options: PublishOptions;
  status: JobStatus;
  result?: MultiPublishResult;
  error?: string;
}

/**
 * 예약 게시 스케줄러.
 *
 * 메모리 기반 타이머로 동작한다. 프로세스가 떠 있는 동안 예약 시각에
 * Publisher를 호출해 발행한다. (영속화가 필요하면 store 콜백으로 확장)
 */
export class Scheduler {
  private readonly jobs = new Map<string, ScheduledJob>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly onComplete?: (job: ScheduledJob) => void;

  constructor(
    private readonly publisher: Publisher,
    opts: { onComplete?: (job: ScheduledJob) => void } = {},
  ) {
    this.onComplete = opts.onComplete;
  }

  /**
   * 콘텐츠를 특정 시각에 발행하도록 예약한다.
   * 과거 시각이면 즉시 실행 대상으로 등록한다.
   */
  schedule(
    content: PostContent,
    runAt: Date,
    options: PublishOptions = {},
  ): ScheduledJob {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job: ScheduledJob = {
      id,
      runAt,
      content,
      options,
      status: 'pending',
    };
    this.jobs.set(id, job);

    const delay = Math.max(0, runAt.getTime() - Date.now());
    log.info(
      `예약 등록 [${id}] — ${runAt.toISOString()} (${Math.round(delay / 1000)}초 후)`,
    );

    const timer = setTimeout(() => void this.run(id), delay);
    // 타이머가 이벤트 루프를 붙잡지 않도록 (CLI/테스트 친화)
    if (typeof timer.unref === 'function') timer.unref();
    this.timers.set(id, timer);

    return job;
  }

  /** 예약을 취소한다. */
  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'pending') return false;
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    job.status = 'canceled';
    log.info(`예약 취소 [${id}]`);
    return true;
  }

  /** 예약된(또는 처리된) 작업 목록 */
  list(): ScheduledJob[] {
    return [...this.jobs.values()].sort(
      (a, b) => a.runAt.getTime() - b.runAt.getTime(),
    );
  }

  get(id: string): ScheduledJob | undefined {
    return this.jobs.get(id);
  }

  /** 즉시 한 작업을 실행한다 (내부/수동 트리거용). */
  private async run(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'pending') return;

    job.status = 'running';
    log.info(`발행 실행 [${id}]`);
    try {
      job.result = await this.publisher.publish(job.content, job.options);
      job.status = job.result.allOk ? 'done' : 'failed';
      if (!job.result.allOk) {
        job.error = job.result.results
          .filter((r) => !r.ok)
          .map((r) => `${r.platform}: ${r.error}`)
          .join('; ');
      }
    } catch (err) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
      log.error(`발행 실패 [${id}] — ${job.error}`);
    } finally {
      this.timers.delete(id);
      this.onComplete?.(job);
    }
  }

  /**
   * 모든 대기 타이머를 정리한다. 프로세스 종료 전 호출 권장.
   */
  shutdown(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
