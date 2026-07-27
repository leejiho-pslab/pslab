# keek(키크) 분석·학습 자료

㈜커버써먼(CVSM)의 라이프스타일 테크 브랜드 **keek(키크)** 에 대한 사전 분석·학습 문서.
요청 범위: ① 제품 2종 상세 분석 ② 인스타그램 계정 분석 ③ 핵심 기능 정리.

## 문서 구성

| 파일 | 내용 |
|---|---|
| [`brand.md`](./brand.md) | 브랜드·운영사·핵심 기술(Pillowdy)·유통·최근 동향 |
| [`product-windbreaker-v3.md`](./product-windbreaker-v3.md) | keek Pillowdy UV Light Windbreaker V3 (자사몰 상품번호 1833) |
| [`product-utility-nylon-vest.md`](./product-utility-nylon-vest.md) | keek Pillowdy Utility Nylon Vest (Mesh lining) (자사몰 상품번호 1793) |
| [`instagram.md`](./instagram.md) | 인스타그램 계정 분석 (@keek_crew / @keek_kr 확인 필요) |
| [`core-features.md`](./core-features.md) | **핵심 기능 정리 — 제품 기능 + 계정 운영 기능 2축** |
| [`knowledge.json`](./knowledge.json) | 위 내용의 기계 판독용 요약 (콘텐츠 생성 파이프라인 투입용) |

## 수집 방법과 신뢰도 (반드시 먼저 읽을 것)

요청받은 3개 URL은 **이 실행 환경의 아웃바운드 정책에서 차단**되어 직접 열람하지 못했다.

```
keek-line.com:443     → CONNECT 403 (policy denial)
www.instagram.com:443 → CONNECT 403 (policy denial)
```

따라서 아래 경로로 **간접 수집 후 교차 검증**했다.

1. **네이버 웹문서 검색 API** — `keek-line.com` 공식 상품 페이지 본문이 색인된 스니펫. 상품 설명 카피는 사실상 원문.
2. **네이버 쇼핑 검색 API** — 가격·품번·컬러·판매처.
3. **국내 언론 보도** (머니투데이·패션비즈·플래텀·벤처스퀘어·이데일리·시사저널e 등) — 스펙·출시 정보·경영 지표.
4. **리테일 리스팅** (KREAM·SSF샵·29CM·컬리·무신사·지그재그) — 품번·컬러·가격 교차 확인.
5. **네이버 블로그 리뷰** — 실측 사이즈, 착용감 등 공식 페이지에 없는 정보.

각 문서에서 정보 등급을 표기한다.

- **[확인]** — 공식 페이지 원문 또는 2개 이상 독립 출처 일치
- **[보도]** — 언론 보도 1차 출처
- **[리뷰]** — 개별 블로거 실측/체감. 오차 가능
- **[추정]** — 위 근거에서 유도한 해석

## 미해결 항목 (원본 접근 필요)

- 공식 사이즈 표(호칭별 총장/어깨/가슴/소매) — 블로거 실측만 확보
- 자사몰 리뷰 수·평점, 정확한 세탁/취급 표시
- **인스타그램 @keek_kr 실체** — 검색 색인에 존재하지 않음. 공개 색인상 공식 계정은 `@keek_crew`. 핸들 변경/신설 여부 확인 필요 (자세한 내용은 `instagram.md`)
- 인스타 게시물별 좋아요·조회수·저장 등 정량 지표 (Apify 등 스크래퍼 MCP 미연결)

작성일: 2026-07-27
