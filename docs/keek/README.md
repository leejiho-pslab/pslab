# keek(키크) 분석·학습 자료

㈜커버써먼(CVSM)의 라이프스타일 테크 브랜드 **keek(키크)** 분석·학습 문서.
요청 범위: ① 제품 2종 상세 분석 ② 인스타그램 계정 분석 ③ 핵심 기능 정리.

> **2026-07-27 실측 갱신 완료.** 초판은 검색 색인 기반 복원이었으나,
> **Cafe24 Admin API · keek-line.com 원문 · Instagram Graph API** 로 전부 실측 대체했다.

## 문서 구성

| 파일 | 내용 |
|---|---|
| [`brand.md`](./brand.md) | 브랜드·운영사·핵심 기술(Pillowdy)·유통·최근 동향 |
| [`product-windbreaker-v3.md`](./product-windbreaker-v3.md) | Pillowdy UV Light Windbreaker V3 (1833) — **컬러×사이즈 재고 전수 포함** |
| [`product-utility-nylon-vest.md`](./product-utility-nylon-vest.md) | Pillowdy Utility Nylon Vest Mesh lining (1793) — **마진·마이너스 재고 경고** |
| [`instagram.md`](./instagram.md) | 인스타그램 실측 분석 (**@keek_kr** — 팔로워·게시물별 좋아요·참여율·발행 패턴) |
| [`core-features.md`](./core-features.md) | **핵심 기능 정리 — 제품 기능 + 계정 기능 2축 + 콘텐츠 앵글 12개** |
| [`knowledge.json`](./knowledge.json) | 기계 판독용 요약 (콘텐츠 생성 파이프라인 투입용) |
| [`data-access-guide.md`](./data-access-guide.md) | 데이터 확인 가이드 — 연결된 API로 끌어오는 법 + API 없이 브라우저로 확인하는 법 |
| [`access-setup.md`](./access-setup.md) | ⭐ **접근 권한 설정 가이드 (3분)** — 자사몰·인스타를 직접 볼 수 있게 만드는 설정. 콘텐츠 작업 전 먼저 볼 것 |

## 수집 경로

이 실행 환경의 egress 정책이 아래 호스트를 차단한다(`CONNECT 403`).

```
keek-line.com   www.instagram.com   api.cafe24.com
graph.facebook.com   keek-ops-dashboard.onrender.com
```

그래서 **GitHub Actions 러너에서 대신 호출**했다. 이 저장소가 원래 쓰는 패턴이다
(`NEXT-SESSION.md` 2항, `keek-api-smoke.yml`과 동일).

| 소스 | 경로 | 얻은 것 |
|---|---|---|
| **Cafe24 Admin API** | `keek-product-ig-pull.yml` (기존 `CAFE24_*` + `DATABASE_URL` 시크릿) | 상품 원본·옵션·**변형별 재고 전수**·마진·등록일 |
| **keek-line.com 스토어프론트** | 동 워크플로 HTML 파싱 | 상세 카피 4섹션 원문·옵션·부가상품·리뷰수 |
| **Instagram Graph API** | 동 워크플로 `business_discovery` (기존 `PSLAB_INSTAGRAM_*` 시크릿) | 팔로워·게시물 50건의 좋아요/댓글/캡션/시각·해시태그·발행분포 |
| 보완 | 네이버 검색 API·언론·리테일 리스팅·블로그 | 브랜드 동향·경쟁 가격·블로거 실측 사이즈 |

실행: **Actions → `keek product + instagram pull` → Run workflow**
(입력 `only` / `ig_users` / `ig_media_limit` / `dump`. 결과는 잡 로그 + `keek-raw-data` 아티팩트)

정보 등급 표기: **[확인]** 공식 원문·2개 이상 출처 일치 / **[보도]** 언론 / **[리뷰]** 블로거 실측 / **[추정]** 해석

## 실측으로 밝혀진 것 (핵심 5가지)

1. **`@keek_crew` → `@keek_kr` 핸들 변경 확정.** 옛 핸들은 Graph API에서 존재하지 않음. 팔로워 실측 **37,798**(색인의 42K는 낡음), 게시물 **511**.
2. **참여율 0.096%** — 통상 브랜드 기준선의 1/10~1/30. 일본 계정(0.196%)의 절반.
3. **해시태그를 사실상 안 쓴다** — 50건 중 10건 남짓. 탐색 유입 경로를 스스로 닫아둔 상태.
4. **V3 '필로우 키트'의 실체** — "이전 Windbreaker KIT(CAH11F)에 굴곡을 추가해 2차원 입체에서 3차원 입체로 업그레이드". 어떤 기사에도 없던 근거.
5. **재고와 콘텐츠가 정반대로 어긋나 있다** — 윈드브레이커는 **3,055장 과잉**인데 인스타 단독 게시물이 없고, 베스트는 **4개 조합 중 3개가 마이너스 재고**인데 계속 판매 노출 중.

## 남은 미해결 항목

- 공식 사이즈표 전 사이즈 수치 — 상세 **이미지** 안에 있어 텍스트 추출 불가
- 혼용률·세탁 취급 표시
- **릴스 재생수·도달·저장·팔로워 데모** — keek 계정 소유 토큰 또는 프로페셔널 인사이트 필요
- 상품별 판매량·조회수 — Cafe24 통계 API 별도
- **베스트(1793) 마이너스 재고의 실제 원인** — 창고 실사 필요 (운영 이슈)

작성일: 2026-07-27
