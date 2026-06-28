# 현대자동차 딜러 원페이지 홈페이지 — 설계 문서

- 작성일: 2026-06-28
- 상태: 승인됨 (구현 진행)
- 위치: `hyundai-dealer/` (이 저장소 내 독립 Astro 프로젝트)
- 개발 브랜치: `claude/hyundai-dealer-homepage-oukndu`

## 1. 목적

현대자동차 딜러를 위한 **원페이지형 브랜드 홈페이지**. 포트폴리오(고객 출고),
차종 소개, 인스타그램, 유튜브 콘텐츠를 한 페이지에 모아 보여주며, SNS 콘텐츠는
**예약 빌드로 자동 업데이트**된다. Apple / 현대·제네시스 공식 사이트 수준의
깔끔하고 전문성 있는 비주얼을 지향한다.

- 참고 레퍼런스(구조): https://dbrick.co.kr/
- 차량 정보 연결: https://www.hyundai.com/kr/ko/e
- 유튜브 채널: https://m.youtube.com/@hyundai_moomoo
- 자료(드라이브): 출고 영상 폴더

## 2. 핵심 결정 (확정)

| 항목 | 결정 |
| --- | --- |
| 콘텐츠 자동 업데이트 | **예약 빌드** (GitHub Actions cron → fetch → build → deploy) |
| 프로젝트 위치 | 이 저장소 내 자체 완결형 `hyundai-dealer/` (pslab-sns와 분리) |
| 기술 스택 | **Astro** 정적 사이트 |
| 인스타그램 연동 | **공식 Instagram Graph API** 토큰 (빌드 시 수집) |
| 유튜브 연동 | YouTube Data API (빌드 시 최신 영상 수집) |
| 포트폴리오 | 고객 **출고 쇼케이스** (사진·영상 그리드/캐러셀) |
| 차종 소개 | 주력 차종 **큐레이션 카드** → hyundai.com 링크아웃 |
| 상담 CTA | **전화·카카오톡 링크** (백엔드 불필요) |
| 디자인 | Apple 스타일 — 큰 타이포, 넓은 여백, 다크 프리미엄 톤, 스크롤 인터랙션 |
| 폰트 | Pretendard(한글) + SF/시스템 폰트 스택 (신뢰감 있는 산세리프) |
| 레이아웃 | **모바일 우선** 반응형 |
| 이미지 | AI/실제 이미지 drop-in 슬롯. 초기엔 CSS/SVG 고급 비주얼로 채움 |

## 3. 아키텍처

```
hyundai-dealer/
  package.json            # 독립 의존성 (astro)
  astro.config.mjs
  tsconfig.json
  .env.example            # YT_API_KEY, IG_ACCESS_TOKEN, 채널/계정 ID
  README.md
  scripts/
    fetch-content.mjs     # YouTube + Instagram → src/data/feed.json
  test/
    fetch-content.test.mjs
  src/
    data/
      site.config.ts      # 딜러 정보·차종·내비·CTA 등 정적 콘텐츠
      feed.json           # 생성·커밋되는 SNS 피드 (폴백 보장)
    styles/global.css
    layouts/Base.astro
    components/
      Nav.astro  Hero.astro  About.astro  Models.astro
      Portfolio.astro  YouTubeFeed.astro  InstagramFeed.astro
      Contact.astro  Footer.astro  StickyCta.astro
    pages/index.astro
  public/images/          # 에셋·생성 이미지

.github/workflows/
  hyundai-dealer.yml      # 예약 빌드·배포 (저장소 루트)
```

### 데이터 흐름

1. `npm run fetch:content` → YouTube Data API + Instagram Graph API 호출
2. 응답을 공통 스키마로 정규화하여 `src/data/feed.json` 생성
3. `astro build` 가 `feed.json` + `site.config.ts` 를 읽어 정적 HTML 생성
4. GitHub Actions: 매일 cron → fetch → build → deploy

### feed.json 스키마

```json
{
  "updatedAt": "ISO8601",
  "youtube": [
    { "id", "title", "thumbnail", "url", "publishedAt" }
  ],
  "instagram": [
    { "id", "caption", "mediaUrl", "thumbnailUrl", "permalink", "mediaType", "timestamp" }
  ]
}
```

## 4. 섹션 구성 (원페이지, 스크롤)

1. **Nav** — 투명→스크롤 시 솔리드, 모바일 햄버거, 앵커 이동
2. **Hero** — 풀스크린, 브랜드 카피 + 대표 비주얼, 스크롤 유도, CTA
3. **About** — 딜러 소개·신뢰 카피, 핵심 수치(선택)
4. **차종소개(Models)** — 주력 현대 차종 큐레이션 카드 → hyundai.com 링크아웃
5. **포트폴리오(Portfolio)** — 고객 출고 쇼케이스 그리드/캐러셀
6. **유튜브(YouTubeFeed)** — 최신 영상 자동 노출 + 채널 바로가기
7. **인스타그램(InstagramFeed)** — 최신 게시물 그리드 자동 + 프로필 바로가기
8. **상담(Contact)** — 전화·카카오톡 CTA, 영업시간·위치
9. **Footer**
10. **StickyCta** — 모바일 하단 고정 전화·카톡 버튼

## 5. 디자인 언어

- **톤**: 다크 프리미엄(제네시스 감도) + 화이트 섹션 교차, 현대 블루 포인트
- **타이포**: Pretendard / SF Pro / system-ui, 큰 헤드라인 + 넉넉한 자간·행간
- **인터랙션**: 스크롤 진입 fade/slide(IntersectionObserver), 미세 parallax
- **모바일 우선**: 모든 섹션 1열 우선 설계 → 데스크톱 확장, 터치 타겟 ≥44px
- **이미지 슬롯**: `site.config.ts`에서 경로 지정, 미지정 시 CSS/SVG 비주얼 폴백

## 6. 오류 처리

- 페치 스크립트는 **마지막 정상 `feed.json` 보존**: API 실패·키 부재 시 기존
  데이터를 덮어쓰지 않고 유지 → 빌드는 항상 성공.
- 비밀키(`YT_API_KEY`, `IG_ACCESS_TOKEN`)는 GitHub Actions Secret으로만 주입,
  코드·저장소에 노출 금지. `.env.example`로 형식만 문서화.
- 각 SNS 섹션은 데이터가 비어도 정상 렌더(섹션 자체 또는 안내 표시).

## 7. 테스트

- **단위**: `fetch-content` 의 응답→`feed.json` 정규화/폴백 로직 (모킹, `node --test`)
- **빌드 스모크**: `astro build` 성공 + 주요 섹션 마크업 존재 확인

## 8. 추후 사용자 제공 정보 (스펙엔 플레이스홀더)

- 딜러/브랜드명, 대표 전화번호, 카카오톡 채널·오픈채팅 링크
- YouTube 채널 ID (핸들 @hyundai_moomoo)
- Instagram 비즈니스 계정 핸들 + Graph API 장기 토큰
- 주력 차종 목록 및 hyundai.com 상세 링크
- 로고·대표 이미지·출고 사진/영상 에셋

## 9. 범위 밖 (YAGNI)

- 상담 신청 폼 백엔드(전화·카톡 링크로 대체)
- 다국어, 블로그/CMS, 로그인, 결제
- 실시간 API 호출(예약 빌드로 충분)
