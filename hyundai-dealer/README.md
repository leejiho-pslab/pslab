# 현대자동차 딜러 원페이지 홈페이지

Apple·현대/제네시스 감도의 깔끔한 **원페이지형** 딜러 홈페이지.
포트폴리오(고객 출고) · 차종소개 · 유튜브 · 인스타그램 콘텐츠를 한 페이지에 모으고,
SNS 콘텐츠는 **예약 빌드로 자동 업데이트**된다.

- 스택: [Astro](https://astro.build) 정적 사이트
- 폰트: Pretendard + SF/시스템 산세리프
- 설계 문서: [`../docs/superpowers/specs/2026-06-28-hyundai-dealer-homepage-design.md`](../docs/superpowers/specs/2026-06-28-hyundai-dealer-homepage-design.md)

## 빠른 시작

```bash
cd hyundai-dealer
npm install
npm run dev        # http://localhost:4321
```

빌드:

```bash
npm run fetch:content   # (선택) SNS 최신 콘텐츠 수집 → src/data/feed.json
npm run build           # 정적 사이트 → dist/
npm run preview         # 빌드 결과 미리보기
```

테스트:

```bash
npm test                # 콘텐츠 수집 정규화·폴백 단위 테스트
```

## 콘텐츠 수정 (코드 수정 없이)

딜러 정보·차종·출고 스토리·연락처는 모두 한 파일에 모여 있다:

- [`src/data/site.config.ts`](src/data/site.config.ts)

이미지 슬롯(`image`, `backgroundImage`)에 경로를 넣으면 해당 위치에 사진이 들어가고,
비워두면 프리미엄 그라디언트 비주얼로 자동 폴백된다.
이미지 파일은 `public/images/` 에 두고 `/images/파일명` 으로 참조한다.

## SNS 자동 업데이트

`npm run fetch:content` 가 아래 API를 호출해 `src/data/feed.json` 을 갱신한다.

| 환경변수 | 설명 |
| --- | --- |
| `YT_API_KEY` | YouTube Data API v3 키 |
| `YT_CHANNEL_ID` | 수집할 채널 ID (`UC...`) |
| `YT_MAX_RESULTS` | 영상 개수 (기본 6) |
| `IG_ACCESS_TOKEN` | Instagram Graph API 장기 토큰 |
| `IG_USER_ID` | (선택) IG 비즈니스 계정 ID |
| `IG_MAX_RESULTS` | 게시물 개수 (기본 8) |

키가 없거나 API가 실패하면 **마지막 정상 `feed.json` 을 그대로 유지**하므로
빌드는 항상 성공한다. 형식은 [`.env.example`](.env.example) 참고.

자동화는 저장소 루트의 GitHub Actions 워크플로
[`.github/workflows/hyundai-dealer.yml`](../.github/workflows/hyundai-dealer.yml) 가
매일 실행한다(키는 GitHub Secrets로 주입).

## 구조

```
src/
  data/site.config.ts   # 모든 정적 콘텐츠 (여기만 고치면 됨)
  data/feed.json         # SNS 피드 (자동 생성·커밋)
  layouts/Base.astro     # 공통 셸 + 스크롤/내비 스크립트
  components/             # 섹션별 컴포넌트
  pages/index.astro      # 섹션 조립
scripts/fetch-content.mjs # SNS 수집기
test/                     # 단위 테스트
```
