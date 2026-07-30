# keek 데이터 확인 가이드 — API 있는 경로 / 없는 경로

두 가지를 나눠 정리한다.
**A. 자동 경로** — 이 저장소에 이미 연결된 API로 끌어오는 법 (에이전트가 실행)
**B. 수동 경로** — API 없이 브라우저만으로 직접 확인하는 법 (사람이 실행)

---

# A. 자동 경로 — 이미 연결된 API로 끌어오기

## A-0. 왜 에이전트가 직접 못 읽나

이 원격 실행 환경의 egress 정책이 아래 호스트를 차단한다(`CONNECT 403`).

```
keek-line.com        www.instagram.com
api.cafe24.com       openapi.naver.com
keek-ops-dashboard.onrender.com
```

`cafe24-ops-status/NEXT-SESSION.md`에 이미 적혀 있는 그대로다.

> "에이전트 샌드박스는 onrender/Neon egress가 막혀 라이브를 직접 못 친다 → **GitHub Actions 워크플로로 확인**"

**GitHub 러너는 egress가 열려 있다.** 그래서 이 프로젝트는 처음부터 "막히는 호출은 Actions에서 대신 실행하고 로그로 확인"하는 패턴을 쓴다(`keek-api-smoke.yml`, `cafe24-daily-collect.yml`, `cafe24-ga4-diag.yml` 전부 이 구조).

## A-1. 이 저장소에 이미 연결된 자격증명

`.github/workflows/cafe24-daily-collect.yml` · `pslab-publish.yml` 기준으로 GitHub Secrets에 등록되어 있는 것들:

| 소스 | Secrets | 무엇을 얻을 수 있나 |
|---|---|---|
| **Cafe24 Admin API** | `CAFE24_MALL_ID` `CAFE24_CLIENT_ID` `CAFE24_CLIENT_SECRET` `CAFE24_ACCESS_TOKEN` `CAFE24_REFRESH_TOKEN` `DATABASE_URL` | **상품 1833·1793 원본** (상품명·판매가·공급가·옵션·변형·재고·카테고리·진열/판매 상태), 주문·매출·리뷰 게시판 |
| **Meta 광고** | `META_ACCESS_TOKEN` `META_AD_ACCOUNT_ID` `META_APP_ID` `META_APP_SECRET` | 광고비·노출·클릭·ROAS, **광고 소재 이미지 + 소재별 성과** |
| **Instagram Graph** | `PSLAB_INSTAGRAM_ACCESS_TOKEN` `PSLAB_INSTAGRAM_IG_USER_ID` | **`business_discovery`로 공개 비즈니스 계정 지표** — 팔로워·게시물 수·바이오·게시물별 좋아요/댓글/캡션/시각 |
| **GA4** | `GA4_PROPERTY_ID` `GOOGLE_APPLICATION_CREDENTIALS_JSON` | 방문자·신규/재방문·구매전환율 |
| **네이버 검색광고** | `NAVER_SA_API_KEY` `NAVER_SA_SECRET_KEY` `NAVER_SA_CUSTOMER_ID` | 파워링크/플레이스 키워드별 성과 |
| **네이버 검색/데이터랩** | `NAVER_CLIENT_ID` `NAVER_CLIENT_SECRET` | 검색 트렌드·경쟁사 |
| 구글/카카오 광고 | `GOOGLE_ADS_*` `KAKAO_*` | 매체별 광고 성과 |

> ⚠️ `PSLAB_INSTAGRAM_*` 는 **P.S.LAB 자사 IG 비즈니스 계정** 토큰이다. 그래도 `business_discovery`로 **타사 공개 비즈니스 계정**(keek 포함)의 팔로워·게시물·좋아요·댓글을 조회할 수 있다. keek 계정 자체의 인사이트(도달·저장·릴스 재생수)는 keek 계정 소유 토큰이 있어야 한다.

## A-2. 추가한 수집 워크플로

**`.github/workflows/keek-product-ig-pull.yml`** (신규) — 3개 소스를 독립적으로 시도한다. 하나가 실패해도 나머지는 수집된다.

| # | 소스 | 필요 자격증명 | 산출물 |
|---|---|---|---|
| 1 | **스토어프론트** keek-line.com 1833·1793 HTML 파싱 | 없음 | 상품명·가격·옵션·상세본문·상세이미지 URL·사이즈 힌트·리뷰수 |
| 2 | **Cafe24 Admin API** products/options/variants/inventories/categories | `CAFE24_*` + `DATABASE_URL` | 상품 원본 JSON (가장 정확) |
| 3 | **Instagram business_discovery** keek_kr·keek_crew·keek_jp | `PSLAB_INSTAGRAM_*` | 팔로워·게시물수·바이오·게시물 50건의 좋아요/댓글/캡션/포맷 + 평균 참여율·상위 게시물 |

결과는 **잡 로그에 요약 출력 + `keek-raw-data` 아티팩트(JSON)** 로 남는다.

### 실행 방법 (웹)

1. GitHub 저장소 → **Actions** 탭
2. 왼쪽에서 **`keek product + instagram pull`** 선택
3. **Run workflow** → 브랜치 선택 → 입력값(선택)
   - `only` — `storefront` / `cafe24` / `instagram` 콤마 구분. 빈값이면 전체
   - `ig_users` — 기본 `keek_kr,keek_crew,keek_jp`
   - `ig_media_limit` — 계정당 게시물 수(기본 50)
4. 실행 후 **잡 로그**에서 요약 확인, 하단 **Artifacts → keek-raw-data** 에서 원본 JSON 다운로드

> ⚠️ **선행 조건**: GitHub는 `workflow_dispatch`를 **기본 브랜치에 있는 워크플로만** 트리거한다.
> 이 저장소 기본 브랜치는 **`claude/eager-lamport-mX0eT`** 이므로, 작업 브랜치에서 그리로 cherry-pick 해야 실행 버튼이 생긴다(`NEXT-SESSION.md` 2항에 적힌 이 프로젝트의 표준 절차와 동일).

### 이 워크플로가 특히 채워주는 공백

지금 분석 문서에서 `[리뷰]`/`[추정]` 등급으로 남아 있는 항목이 `[확인]`으로 승격된다.

- 공식 사이즈표 전 사이즈 수치, 정확한 혼용률, 세탁·취급 표시
- 자사몰 리뷰 수·평점, 재고·품절 상태, 실제 진열/판매 여부
- **`@keek_kr`의 실존 여부** — business_discovery가 계정을 찾으면 확정, 못 찾으면 비공개/개인계정/미존재로 판별
- 게시물별 좋아요·댓글·발행 시각 → **훅 유형별 성과 학습**, 요일·시간대 패턴, 릴스 vs 피드 비중

---

# B. 수동 경로 — API 없이 브라우저로 확인하기

에이전트가 못 여는 것들을 사람이 직접 확인하는 체크리스트.

## B-1. 상품 페이지 (keek-line.com)

**URL**
- 윈드브레이커 V3: `https://keek-line.com/product/keek-pillowdy-uv-light-windbreaker-v3/1833/`
- 유틸리티 베스트: `https://keek-line.com/product/keek-pillowdy-utility-nylon-vest/1793/`
- 짧은 형태도 동일: `https://keek-line.com/product/detail.html?product_no=1833`

**확인할 항목** (지금 문서에서 비어 있는 것들)

- [ ] **공식 사이즈표** — XS/S/M/L/XL/XXL 총장·어깨·가슴단면·소매길이. 대개 **상세 이미지 안**에 있어 텍스트 검색이 안 된다 → 스크린샷 필요
- [ ] **혼용률** — "나일론 100%" 등 정확한 표기
- [ ] **세탁·취급 주의** 문구
- [ ] **리뷰 수 / 평점** — 상품 하단 REVIEW 탭 숫자
- [ ] **품절 옵션** — 컬러·사이즈 드롭다운에서 "품절" 표시된 조합
- [ ] **적립금·배송비·교환/반품** 조건
- [ ] 상세페이지 **카피 문구 원문**과 해시태그

**팁**: 상세 스펙이 이미지라 복사가 안 될 때 → 이미지 우클릭 "새 탭에서 이미지 열기"로 URL을 따서 주시면 됩니다. 또는 브라우저에서 `Ctrl+S` → "웹페이지, HTML만"으로 저장한 파일을 올려주셔도 제가 파싱합니다.

## B-2. Cafe24 관리자 (가장 정확)

1. `https://keek.cafe24.com/admin` 로그인
2. **상품 → 상품 관리 → 상품 목록** → 검색창에 상품번호 `1833` / `1793`
3. 상품 수정 화면에서 확인
   - 상품명·영문 상품명·모델명·**자체 상품 코드**
   - 판매가·소비자가·공급가·**할인 설정**
   - 옵션(컬러/사이즈) 전체 + **옵션별 재고**
   - 진열 상태 / 판매 상태 / 카테고리 배정
4. **상품 → 상품 후기** 또는 게시판에서 리뷰 수·평점
5. **통계 → 상품 분석**에서 해당 상품의 조회수·판매량

## B-3. 라이브 운영 대시보드

**https://keek-ops-dashboard.onrender.com**

5개 탭: `카페24 어드민` / `광고` / `광고 히스토리` / `경쟁사 모니터링` / `월간 리포트`

**함정 2가지** (`NEXT-SESSION.md` 7항)
- 화면에 "오류"가 뜨면 대개 **Render 콜드스타트**다. 10~30초 기다렸다 새로고침. (keepalive 워크플로가 10분마다 핑하지만 놓칠 때가 있음)
- 그래도 이상하면 **`Ctrl+Shift+R`** (브라우저 캐시 강제 새로고침)

## B-4. 인스타그램 웹에서 확인

**프로필**: `https://www.instagram.com/keek_kr` / `https://www.instagram.com/keek_crew`

- [ ] **`keek_kr`이 실제로 열리는지** — 안 열리면 핸들이 잘못됐거나 비공개
- [ ] 열린다면: 팔로워 수 / 게시물 수 / 바이오 / 링크 / 카테고리 라벨
- [ ] **릴스 탭**(`/reels/`) — 썸네일에 **재생수**가 표시된다. 상위 10개를 훑으면 어떤 훅이 먹히는지 바로 보인다
- [ ] 최근 12개 게시물의 **좋아요·댓글 수**와 캡션 첫 줄(=훅)
- [ ] 태그된 게시물 탭 — 협찬 크리에이터 UGC 규모

**계정 소유자라면 (훨씬 좋음)**
- 모바일 앱 → 프로필 → **프로페셔널 대시보드 → 인사이트**
- 여기서만 나오는 것: **도달·저장·공유·프로필 방문·팔로워 데모(성/연령/지역)·활동 시간대**
- 게시물별 인사이트에서 **릴스 재생수·시청 유지율**
- 90일치를 CSV로 뽑아 주시면 그대로 학습에 넣습니다

## B-5. 무료 외부 교차 확인

| 목적 | 도구 | 링크 |
|---|---|---|
| 경쟁사·자사 **광고 소재 전수 열람** | Meta 광고 라이브러리 | `facebook.com/ads/library` — 검색어 "keek" |
| 검색 수요 추이 | 네이버 데이터랩 | `datalab.naver.com` — "목베개", "경량바람막이", "키크" |
| 리셀 시세·거래량 | KREAM | `kream.co.kr/brand-stores/keek` |
| 가격 비교·판매처 | 네이버 쇼핑 | 카탈로그 `59789698258`(V3), `59815900846`(베스트) |
| 리뷰 여론 | 네이버 블로그 검색 | "키크 필로우디 후기" |

## B-6. 저에게 전달하는 법 (API 없이 분석 이어가기)

셋 중 아무거나 편한 방법으로 주시면 됩니다.

1. **스크린샷** — 사이즈표 이미지, 인스타 인사이트 화면. 제가 읽습니다.
2. **HTML 저장 파일** — 브라우저 `Ctrl+S` → "웹페이지, HTML만" → 파일 업로드. 제가 파싱합니다.
3. **텍스트 붙여넣기** — 상세 카피, 옵션 목록, 리뷰 수 등

## B-7. 근본 해결 — egress 정책 열기

매번 수동으로 하지 않으려면 환경 네트워크 정책에서 아래 호스트를 허용하면 됩니다.
[claude.ai/code](https://claude.ai/code) → 해당 Environment → 네트워크 접근 정책 (조직 관리자 권한 필요할 수 있음)

```
keek-line.com, *.keek-line.com
*.cafe24api.com, api.cafe24.com
keek-ops-dashboard.onrender.com
graph.facebook.com
openapi.naver.com
```

문서: https://code.claude.com/docs/en/claude-code-on-the-web

> 단, **instagram.com은 정책을 열어도 비로그인 스크래핑이 막힙니다.** 인스타는 위 A-2의 Graph API 경로가 정답입니다.
