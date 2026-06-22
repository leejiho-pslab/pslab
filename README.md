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

## 라이선스

MIT
