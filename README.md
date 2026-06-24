# pslab-sns

플러그인 기반 **SNS 자동화** 도구. 하나의 콘텐츠를 여러 SNS 채널에 **생성 → 동시 발행 → 예약 → 성과 분석**까지 자동화합니다.

- **대상 플랫폼**: YouTube · 네이버 블로그 · Instagram · Threads · LinkedIn
- **스택**: Node.js 20+ / TypeScript (ESM)
- **핵심 컨셉**: 각 플랫폼은 공통 인터페이스를 구현한 **플러그인**입니다. 레지스트리에 등록(연결)만 하면 발행·분석 파이프라인이 자동으로 활용합니다.

## 빠른 시작

```bash
npm install
cp .env.example .env     # 자격 증명 입력 (없어도 데모는 동작)

npm run demo             # 종단 간 데모 (연결→생성→발행→예약→리포트)
npm test                 # 단위 테스트
npm run build            # dist/ 로 컴파일
```

CLI:

```bash
npm run dev -- status
npm run dev -- publish --topic "신제품 출시" --targets instagram,threads --image hero.png
npm run dev -- schedule --at 2026-06-23T09:00:00Z --topic "주간 소식" --targets linkedin
npm run dev -- report --topic "성과 점검"
```

> 기본값은 `PSLAB_DRY_RUN=true`(시뮬레이션)입니다. 실제 발행은 `.env`에서 `false`로 바꾸고 각 플랫폼 SDK 연동을 채워 넣으세요.

## 아키텍처

```
PluginRegistry ──┬─ YouTubePlugin
 (플러그인 연결)  ├─ NaverBlogPlugin
                 ├─ InstagramPlugin     각 플러그인은 SnsPlugin 인터페이스 구현:
                 ├─ ThreadsPlugin         connect / publish / fetchAnalytics / validate
                 └─ LinkedInPlugin
        │
        ├─ ContentPipeline   주제(brief) → PostContent (텍스트/미디어 프로바이더 주입 가능)
        ├─ Publisher         멀티채널 동시 발행 (병렬 + 플랫폼별 검증)
        ├─ Scheduler         예약 발행 (타이머 기반)
        └─ Analytics         성과 수집 + 집계 리포트
```

### 자동화 4종

| 기능 | 담당 | 설명 |
|------|------|------|
| 콘텐츠 생성+게시 | `ContentPipeline` → `Publisher` | brief로 글/태그/미디어 생성 후 발행 |
| 예약 게시 | `Scheduler` | 지정 시각에 자동 발행 |
| 멀티 채널 동시 발행 | `Publisher` | 1개 콘텐츠를 N개 채널에 병렬 발행 |
| 분석/리포팅 | `Analytics` | 채널별 지표 수집·집계 |

## 프로그래밍 방식 사용

```ts
import { bootstrap, Analytics } from 'pslab-sns';

const app = await bootstrap();          // .env 자격 증명으로 자동 연결

const content = await app.content.generate({
  topic: '신제품 출시',
  tone: '캐주얼',
  media: [{ kind: 'image', prompt: '제품 히어로샷' }],
});

const result = await app.publisher.publish(content, {
  targets: ['instagram', 'threads', 'linkedin'],
});

const report = await app.analytics.collect(
  Analytics.fromPublishResults(result.results),
);
console.log(Analytics.format(report));
```

## 새 플랫폼(플러그인) 추가하기

1. `src/plugins/<platform>.ts` 에서 `BasePlugin`을 확장합니다.
2. `requiredCredentials`, `authenticate`, `publish`, `fetchAnalytics`, (필요시) `validate`를 구현합니다.
3. `src/index.ts`의 `defaultPlugins()`에 추가하거나 `registry.register()`로 직접 등록합니다.

```ts
export class TikTokPlugin extends BasePlugin {
  readonly platform = 'tiktok';
  readonly displayName = 'TikTok';
  protected requiredCredentials() { return ['accessToken']; }
  protected async authenticate(c) { /* ... */ return '계정명'; }
  async publish(content) { /* ... */ }
  async fetchAnalytics(remoteId) { /* ... */ }
}
```

## 실제 API 연동 지점

각 플러그인의 `simulateApiCall(...)` 호출부를 실제 SDK로 교체하면 됩니다.

- **YouTube**: `googleapis` → `youtube.videos.insert`, YouTube Analytics API
- **네이버 블로그**: 네이버 오픈 API 글쓰기 + 데이터랩
- **Instagram / Threads**: Meta Graph API 2단계 발행 (container → publish) + insights
- **LinkedIn**: `/rest/posts` + share statistics

## 콘텐츠 생성 프로바이더 연결 (선택)

`ContentPipeline`에 텍스트/미디어 프로바이더를 주입하면 AI 생성으로 업그레이드됩니다.

```ts
import { ContentPipeline } from 'pslab-sns';

const content = new ContentPipeline({
  text:  { generate: async (brief) => callLLM(brief) },      // 예: Claude API
  media: { generate: async (req)   => callImageGen(req) },   // 예: 이미지 생성 도구
});
```

프로바이더를 주입하지 않으면 결정론적 템플릿 폴백을 사용하므로 키 없이도 전체 흐름이 동작합니다.

## 오토파일럿 (자동 강화 계층)

설계도(`docs/설계도.md`)의 "끝이 처음으로 이어지는 둥근 벨트"를 구현한 상위 계층.
한 클라이언트에 대해 **시장조사 → 제작 → 검수 → 발행 → 성적표 → AI 회의 → 강화**를
한 사이클로 묶어 돌린다. 모든 모듈은 자격 증명 없이 mock으로 동작한다.

```bash
npm run autopilot                # 둥근 벨트 데모 (사이클 2회 + 강화)
npm run daemon-demo              # 무인 데몬 라이브 데모 (예약 시각에 스스로 발화)
npm run dev -- clients           # 등록된 클라이언트(설정표) 목록
npm run dev -- cycle --client demo-cafe   # 한 클라이언트 1사이클 실행
TZ=Asia/Seoul npm run dev -- daemon       # 무인 데몬 — scheduleTimes에 자동 발행
npm run dev -- daemon --once              # 모든 클라이언트 즉시 1사이클
```

| 모듈 | 설계도 작업소 | 역할 |
|------|---------------|------|
| `MarketResearch` | 1. 시장 조사실 | 경쟁사·트렌드 모니터링, 과거 반응으로 소재 강화 |
| `ContentPipeline` + `CapabilityRegistry` | 2. 제작 공장 | 글/미디어 생성 + 제작 도구 자가 업그레이드 |
| `ReviewGate` | 3. 검수 스위치 | `manual`→`rules`→`auto` 단계 전환 |
| `Publisher` | 4. 발송 센터 | 멀티채널 동시 발행 |
| `Analytics` | 5. 성적표실 | 성과 집계 (경쟁사 비교) |
| `Council` | 6. AI 회의실 | 분야별 AI 토론으로 다음 방향 합의 |
| `Orchestrator` | 둥근 벨트 | 위를 한 사이클로 묶고 이력을 강화 신호로 환류 |
| `AutomationDaemon` | 관리인 | scheduleTimes에 맞춰 사이클을 24시간 자동 트리거 |
| `ClientConfig` / `ClientStore` | 공장 복제 | 설정표 1장으로 클라이언트 추가, 격리 저장 |
| `AlertHub` | 고장 알림벨 | 실패·승인 대기 알림 |

```ts
import { createApp, createAutopilot, loadClients } from 'pslab-sns';

const app = await /* bootstrap or createApp */ createApp({ dryRun: true });
const auto = createAutopilot({ app, dataDir: './data/clients' });

for (const client of loadClients('./clients')) {
  const rec = await auto.orchestrator.runCycle(client);   // 한 바퀴
  console.log(rec.topic, rec.published, rec.direction.rationale);
}
```

### 검수 스위치 (95% → 100% 자동)

```ts
import { ReviewGate } from 'pslab-sns';
const gate = new ReviewGate({ mode: 'manual', bannedWords: ['최저가'] });
// 신뢰가 쌓이면 단계적으로 전환
gate.setMode('rules');   // 규칙 자동 검사
gate.setMode('auto');    // 100% 자동 (금지어 등 안전장치는 유지)
```

> 클라이언트 설정표는 `clients/*.json` (예시: `clients/demo-cafe.example.json`).
> 실제 설정표(자격/내부 정보 포함)는 `.gitignore`로 커밋에서 제외된다.

## 라이선스

MIT
