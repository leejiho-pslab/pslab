# 회원님만 할 수 있는 것 (토큰·API 연결)

자동화로 만들 수 있는 모든 코드/연결/데모는 구축 완료했습니다. 아래는 **비공개 자격증명**이
필요해 제가 대신 못 하는 항목만 모았습니다. 전부 **무료**이며, 우선순위 순서입니다.

> 토큰 없이 지금 바로 실데이터 보기:
> ```
> python scripts/seed_real_demo.py   # 네이버 공개 API 실응답으로 경쟁사 탭 채움
> ./scripts/dev.sh                    # 대시보드 → 경쟁사 탭에 실제 상품/트렌드
> ```

---

## 1순위 — 카페24 (매출·주문, 모든 KPI의 기준) ⏱️ 15분
모든 핵심 지표의 원천. 이것부터 연결하면 대시보드가 실제 매출로 채워집니다.

| 회원님이 할 일 | 어디서 |
|---|---|
| 앱 생성 → Client ID/Secret | developers.cafe24.com (무료) |
| Redirect URI `https://localhost` 등록, scope `mall.read_order`,`mall.read_customer` | 앱 설정 |
| 토큰 발급 | `python scripts/cafe24_auth.py --authorize` → 승인 → `--code <코드>` |

→ `secrets.env`에 `CAFE24_MALL_ID/CLIENT_ID/CLIENT_SECRET` 입력 후 위 명령. 끝나면
`python scripts/smoke_live.py --check` 출력을 저에게 주세요. **(상세: CONNECT-GUIDE.md STEP1)**

---

## 2순위 — 광고 채널 (전부 무료 API)
각 채널 토큰만 `secrets.env`에 넣으면 커넥터가 이미 대기 중입니다.

| 채널 | 회원님이 발급할 것 | 무료 발급처 | 난이도 |
|---|---|---|---|
| **Meta** | 액세스 토큰(ads_read) + 광고계정 ID | developers.facebook.com | 쉬움 |
| **네이버 SA** | API_KEY / SECRET_KEY / CUSTOMER_ID | searchad.naver.com → API 사용관리 | 쉬움 |
| **카카오모먼트** | 액세스 토큰 + 광고계정 ID | kakao developers (모먼트 scope) | 보통 |
| **Google Ads** | 개발자 토큰 + OAuth 토큰 + Customer ID | Google Ads API Center | 어려움(토큰 승인) |

→ `secrets.env` 해당 변수 채우고 `python scripts/run_all.py --mode live --days 14`.
넣은 채널만 수집되고 나머지는 자동 스킵. **(상세: CONNECT-GUIDE.md STEP 2,4,5,6)**

---

## 3순위 — 경쟁사 자동수집 (네이버, 무료) ⏱️ 5분
지금은 제가 공개 API로 실데이터를 시드해 뒀지만, **매일 자동 갱신**하려면 회원님 키 필요.

| 회원님이 할 일 | 어디서 |
|---|---|
| 앱 등록 → Client ID/Secret (검색어트렌드 + 검색 API 사용 설정) | developers.naver.com (무료) |

→ `secrets.env`에 `NAVER_CLIENT_ID/SECRET` + `sources.yaml`의 `competitors`를 **실제 경쟁사명**으로
교체(현재 컴포트랩/데일리핏/무브웨어는 샘플). 그러면 트렌드+베스트+후기+프로모션 자동 수집.

---

## 4순위 — 운영 인프라 (선택, 전부 무료 티어)

| 항목 | 회원님이 할 일 | 무료 옵션 |
|---|---|---|
| **DB 영속화** | `DATABASE_URL` 설정 | Supabase / Neon / Railway (무료 Postgres) — 코드는 이미 지원 |
| **무인 자동수집** | GitHub Secrets에 위 키들 등록 | GitHub Actions (무료 한도) — 워크플로 이미 있음 |
| **알림** | Incoming Webhook URL | Slack (무료) → `SLACK_WEBHOOK_URL` |
| **호스팅** | 배포 | Render/Railway/Fly 무료 티어 또는 자체 서버(Docker) |

---

## 제가 이미 끝낸 것 (회원님 작업 불필요)
- ✅ 커넥터: 카페24, Meta, Google, 네이버 SA, 카카오모먼트, 네이버 데이터랩/검색
- ✅ 경쟁사 실데이터: 검색 트렌드 + 베스트 상품 + 당일 후기 + 프로모션 감지 (정확매칭 노이즈 제거)
- ✅ 토큰 없이 실데이터 데모 시드 (`seed_real_demo.py`)
- ✅ SQLite/Postgres 전환, /health 모니터링, 소스 격리(한 채널 실패가 전체 안 막음)
- ✅ 카페24 OAuth 발급 헬퍼, 전체 58개 테스트 통과, 오류체크/최적화 완료

## 막히면
각 단계의 **에러 메시지나 `--check` 출력**을 그대로 주세요. 토큰 만료(401)·scope·계정 ID 같은
첫 연결 문제는 응답만 보면 바로 잡아드립니다.
