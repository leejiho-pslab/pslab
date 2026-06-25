# 카페24 live 1일 수집 스모크 가이드

`mock` 으로 전체 흐름을 검증했으니, 실제 카페24 자격증명으로 **하루치 데이터를 실수집**해
연동을 확인하는 절차다.

## 1. 카페24 OAuth 앱 / 토큰 준비

1. **카페24 개발자센터**(developers.cafe24.com)에서 앱 생성
2. 앱에 권한(scope) 부여: 최소 `mall.read_order` (주문), 필요 시 `mall.read_customer`(회원)
3. OAuth 인증으로 `access_token` / `refresh_token` 발급
   - `access_token` 유효 2시간 · `refresh_token` 유효 2주
   - `client_id` / `client_secret` 이 있으면 만료 시 자동 갱신됨
4. 본인 쇼핑몰의 `mall_id` 확인 (관리자 URL `https://{mall_id}.cafe24.com`)

## 2. 자격증명 입력

```bash
cd cafe24-ops-status
cp config/secrets.env.example config/secrets.env
```

`config/secrets.env` 를 편집:

```
CAFE24_OPS_MODE=live
CAFE24_MALL_ID=실제몰id
CAFE24_ACCESS_TOKEN=발급받은_access_token
CAFE24_REFRESH_TOKEN=발급받은_refresh_token
CAFE24_CLIENT_ID=앱_client_id
CAFE24_CLIENT_SECRET=앱_client_secret
# (선택) 방문자 통계 엔드포인트가 있으면 지정 — 없으면 방문자/전환율은 건너뜀
# CAFE24_VISITORS_PATH=/api/v2/admin/...
```

> `secrets.env` 는 `.gitignore` 로 커밋되지 않는다.

## 3. 점검 → 수집

```bash
# (A) 자격증명 + 연결만 점검 (쓰기 없음)
python scripts/smoke_live.py --check

# (B) 실제 1일 수집 + 저장 + 요약
python scripts/smoke_live.py --date 2026-06-17
```

스모크는 3단계로 진행된다:
1. **자격증명 점검** — 필수/권장 환경변수 존재 여부
2. **연결 점검** — `orders/count` 1회 호출 (성공 시 주문건수 출력)
3. **수집** — 주문 → `gross_sales / order_count / aov`(+방문자 설정 시 전환율, 신규가입) 적재

광고·소재·경쟁사 소스는 아직 미구현이라 자동으로 **건너뛴다**(경고 출력). 카페24만 실수집된다.

## 4. 대시보드에서 확인

```bash
uvicorn api.main:app --reload      # :8000
cd dashboard && npm run dev        # :5173 → 해당 날짜 선택
```

## 트러블슈팅

| 증상 | 원인 / 조치 |
|------|------------|
| `[실패] HTTPStatusError 401` | access_token 만료 → refresh 정보 확인하거나 토큰 재발급 |
| `403 / Insufficient scope` | 앱 권한에 `mall.read_order` 추가 |
| `count = 0` | 해당일 주문이 실제로 0이거나 날짜(KST) 확인 |
| 매출이 비어 보임 | API 버전별 금액 필드 차이 — `order_amount()` 매핑 조정(`collectors/cafe24.py`) |
| 방문자/전환율 없음 | `CAFE24_VISITORS_PATH` 미설정 (정상) — 통계 엔드포인트 지정 시 활성화 |

## 일일 자동화(다음 단계)

검증되면 스케줄러로 매일 1회 무인 실행:

```bash
# crontab 예: 매일 07:10 KST 전일자 수집
10 7 * * *  cd /경로/cafe24-ops-status && python scripts/run_all.py --mode live
```
