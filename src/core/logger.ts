/** 아주 가벼운 구조화 로거. 외부 의존성 없이 일관된 출력만 제공한다. */

type Level = 'debug' | 'info' | 'warn' | 'error';

const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const icons: Record<Level, string> = {
  debug: '·',
  info: 'ℹ',
  warn: '⚠',
  error: '✖',
};

let threshold: Level =
  (process.env.PSLAB_LOG_LEVEL as Level | undefined) ?? 'info';

export function setLogLevel(level: Level): void {
  threshold = level;
}

function emit(level: Level, scope: string, msg: string): void {
  if (order[level] < order[threshold]) return;
  const ts = new Date().toISOString();
  const line = `${icons[level]} [${ts}] (${scope}) ${msg}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/** 스코프(모듈/플러그인 이름)가 붙은 로거를 만든다. */
export function createLogger(scope: string): Logger {
  return {
    debug: (m) => emit('debug', scope, m),
    info: (m) => emit('info', scope, m),
    warn: (m) => emit('warn', scope, m),
    error: (m) => emit('error', scope, m),
  };
}
