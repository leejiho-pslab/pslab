# 다음 세션 인수인계 — keek 콘텐츠 제작

> 작성 2026-07-27 · 이전 세션: `Keek 제품 및 인스타그램 분석`
> 브랜치: **`claude/keek-product-instagram-analysis-i9onxa`**

## 0. 새 세션 첫 마디로 이걸 쓰세요

```
leejiho-pslab/pslab 의 claude/keek-product-instagram-analysis-i9onxa 브랜치에서
docs/keek/HANDOFF.md 읽고 이어서 진행해줘. 먼저 접근 확인부터.
```

**주의**: 새 세션 만들 때 하단 **☁ 버튼**으로 환경을 **`keek-작업환경`** 으로 바꿔야 합니다.
`기본정의`로 두면 이전 세션과 똑같이 전부 차단됩니다.

---

## 1. 가장 먼저 할 일 — 접근 확인

```bash
for h in keek-line.com api.cafe24.com graph.facebook.com cafe24img.poxo.com \
         keek-ops-dashboard.onrender.com openapi.naver.com; do
  printf "%-38s " "$h"
  curl -sS -o /dev/null -w "%{http_code}\n" --max-time 15 "https://$h/" 2>&1 | tail -1
done
```

- `200`/`3xx`/`4xx` → 뚫림 (프록시 통과)
- `000` → 여전히 차단. 환경이 `keek-작업환경`으로 선택됐는지 재확인

허용 도메인 8개: `keek-line.com` `*.keek-line.com` `*.cafe24api.com` `api.cafe24.com`
`cafe24img.poxo.com` `graph.facebook.com` `keek-ops-dashboard.onrender.com` `openapi.naver.com`

> `instagram.com`은 의도적으로 제외했다. 로그인 월 때문에 열어도 못 읽는다.
> 인스타 데이터는 `graph.facebook.com`(Meta 공식 API)으로 가져온다.

---

## 2. 이미 확보된 것 (다시 조사하지 말 것)

`docs/keek/` 7개 문서에 실측 데이터가 전부 들어 있다.

| 파일 | 핵심 |
|---|---|
| `README.md` | 인덱스 + 수집 경로 + 핵심 발견 5가지 |
| `brand.md` | 브랜드·Pillowdy 기술·유통·동향 |
| `product-windbreaker-v3.md` | 1833 — 24변형 재고 전수, 상세 카피 4섹션 원문 |
| `product-utility-nylon-vest.md` | 1793 — 마진 38%, **마이너스 재고 경고** |
| `instagram.md` | @keek_kr 실측 — 팔로워·좋아요·참여율·발행패턴·해시태그 |
| `core-features.md` | 제품 기능 + 계정 기능 2축 + **콘텐츠 앵글 12개** |
| `knowledge.json` | 기계 판독용 요약 |
| `access-setup.md` | 접근 설정 가이드 |
| `data-access-guide.md` | API 경로 + 브라우저 수동 확인 경로 |

### 반드시 기억할 사실 6가지

1. **인스타 핸들은 `@keek_kr`** (구 `@keek_crew`는 폐기). 팔로워 **37,798** / 게시물 **511**
2. **참여율 0.096%** — 평균 좋아요 33.8, 댓글 2.5. 일본 계정(0.196%)의 절반
3. **해시태그를 거의 안 쓴다** — 50건 중 10건 남짓. 최대·최속 개선점
4. **V3 '필로우 키트' 실체** = "이전 Windbreaker KIT(CAH11F)에 굴곡을 추가해 2차원 입체에서 3차원 입체로 업그레이드"
5. **미부각 최대 논거** = "공기를 빼면 목베개 기능이 전혀 보이지 않아 스타일 유지"
6. **UV차단·패커블은 윈드브레이커(1833) 전용.** 베스트(1793) 상세엔 해당 섹션이 없다 — 혼용 금지

---

## 3. 재고가 정한 콘텐츠 우선순위 ⭐

| 대상 | 재고 | 액션 |
|---|---|---|
| **1833 D.Khaki M/L** | 1,199장 (전체 39%) | **최우선**. 대표 컬러로 |
| 1833 Black | 975장 (XS 품절) | 2순위 |
| 1833 L.Blue | 439장 (XL 3장) | 신규 컬러 소구 가능, XL 안내 필요 |
| 1833 Beige | 442장 (**S·XL 품절**) | 대표로 밀면 품절 이탈 |
| **1793 베스트** | **47장, 4개 중 3개 마이너스** | **밀지 말 것.** 재입고 확인 후 |

> 1793의 마이너스 재고(Gray L −7, Black M −9, Black L −16)는 **운영 이슈**다.
> 판매 상태가 T라 계속 팔리고 있다. 콘텐츠 이전에 창고 실사 확인이 필요하다.

---

## 4. 데이터 재수집 방법

이미 만들어 둔 워크플로가 있다. **기본 브랜치 `claude/eager-lamport-mX0eT`에 있다.**

```
.github/workflows/keek-product-ig-pull.yml
cafe24-ops-status/scripts/keek_product_ig_pull.py
```

- Actions → `keek product + instagram pull` → Run workflow
- 입력: `only`(storefront/cafe24/instagram) · `ig_users` · `ig_media_limit` · `dump`
- 결과: 잡 로그 전량 덤프 + `keek-raw-data` 아티팩트

**접근이 뚫렸다면** 이 워크플로 없이 직접 호출하는 게 훨씬 빠르다.
스크립트는 그대로 로컬 실행 가능:
```bash
cd cafe24-ops-status && python scripts/keek_product_ig_pull.py --dump --out out
```
(단 `CAFE24_*`·`PSLAB_INSTAGRAM_*` 환경변수 필요 — 세션에 없으면 워크플로 경로 사용)

---

## 5. 아직 없는 것 (사용자 요청 대기 중)

| 항목 | 왜 필요 | 얻는 법 |
|---|---|---|
| **릴스 재생수·도달·저장** | 참여율 0.096%가 "노출 부족"인지 "반응 부족"인지 구분 불가 | keek IG 프로페셔널 대시보드 인사이트 캡처 or `KEEK_INSTAGRAM_*` 토큰 |
| **팔로워 데모(성·연령·지역·활동시간)** | 타깃 정합·발행 시간 최적화 | 동일 |
| **공식 사이즈표** | 상세 이미지 안이라 텍스트 추출 불가 | 접근 뚫리면 이미지 열람, 아니면 캡처 |
| 1793 실제 재고 | 마이너스 재고 원인 | 창고 실사 |

---

## 6. 다음 작업 = 콘텐츠 제작

사용자 요청: **"제품을 분석하고 콘텐츠를 만들 것"**

- 분석은 끝났다. 바로 제작 단계로 갈 것.
- 앵글 12개가 `core-features.md` §C에 있다. 최우선 3개:
  1. **"안 쓸 땐 티도 안 납니다"** — 목베개 일체형의 최대 약점 반박
  2. **"V2랑 뭐가 다르냐면, 키트가 2D에서 3D가 됐습니다"** — 같은 159,000원
  3. **"입 대기 싫으면 이거 8,900원"** — Flexible Air Tube Kit
- 채널: 인스타그램 (릴스 우선, 계정 실측상 릴스 80%)
- 제작 시 **해시태그 3층(브랜드·카테고리·상황)을 반드시 넣을 것** — 현재 계정의 최대 결손
- 이 저장소에 인스타 발행 파이프라인이 이미 있다: `instagram-publisher` / `instagram-carousel-autopost` 스킬
