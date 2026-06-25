# GitHub Actions 무인 수집 가이드

이 웹 샌드박스는 외부 API egress 가 차단돼 라이브 수집이 안 됩니다. **GitHub Actions
러너는 외부 통신이 열려 있어** cafe24/Meta/Naver/Kakao 호출이 정상 동작합니다.
아래 순서로 설정하면 매일 자동으로 실데이터가 쌓입니다.

```
[GitHub Actions(매일)] --실수집--> [무료 Postgres] <--읽기-- [대시보드/API]
```

---

## STEP 1 — 무료 Postgres 준비 (영속 저장소)
러너는 매번 초기화되므로 데이터는 외부 DB에 저장해야 합니다(특히 cafe24 회전 토큰).
무료 티어 아무거나:
- **Supabase**(supabase.com) → 프로젝트 → Settings → Database → Connection string(URI)
- **Neon**(neon.tech) → 프로젝트 → Connection string
- **Railway**(railway.app) → Postgres → Connect → Postgres Connection URL

받은 URL을 그대로 사용: `postgresql://user:pass@host:5432/dbname`
(코드는 `DATABASE_URL` 만 있으면 자동으로 Postgres 로 동작 — 별도 작업 없음)

---

## STEP 2 — GitHub Secrets 등록
**저장소 → Settings → Secrets and variables → Actions → New repository secret**

| Secret | 값 | 채널 |
|---|---|---|
| `DATABASE_URL` | STEP1 의 Postgres URL | **공통(필수)** |
| `CAFE24_MALL_ID` | `coversomeone1` | cafe24 |
| `CAFE24_CLIENT_ID` | `SFifOfmzX0Nh635bOfavxH` | cafe24 |
| `CAFE24_CLIENT_SECRET` | (앱의 Client Secret) | cafe24 |
| `CAFE24_ACCESS_TOKEN` / `CAFE24_REFRESH_TOKEN` | STEP3 에서 발급 | cafe24(최초 1회) |
| `META_ACCESS_TOKEN` | 시스템 사용자 토큰(ads_read) | Meta |
| `META_AD_ACCOUNT_ID` | `1513093573064263` | Meta |
| `NAVER_SA_API_KEY` / `NAVER_SA_SECRET_KEY` / `NAVER_SA_CUSTOMER_ID` | 검색광고 API | Naver SA |
| `KAKAO_ACCESS_TOKEN` / `KAKAO_AD_ACCOUNT_ID` | 카카오모먼트 | Kakao |
| `GOOGLE_ADS_*` | 개발자토큰/액세스토큰/Customer ID | Google |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 데이터랩/검색 | 경쟁사 |
| `SLACK_WEBHOOK_URL` | 인커밍 웹훅 | 알림(선택) |

> 채널은 **있는 것만** 채우면 됩니다. 빠진 채널은 자동 스킵.

---

## STEP 3 — cafe24 토큰 최초 발급 (회전은 이후 자동)
cafe24 access 토큰은 2시간, refresh 토큰은 2주 만료되며 갱신 시 회전됩니다.
**최초 토큰만 한 번** 발급해 두면, 이후 일일 잡이 자동 갱신해 Postgres(app_kv)에 보존합니다.

**방법 A — 로컬에서 (가장 안정적, 권장)**
인가코드는 발급 후 ~1분 만료라 로컬이 안전합니다.
```bash
# 1) 인가 URL 생성 → 브라우저 승인 → 주소창 code= 복사
python scripts/cafe24_auth.py --authorize --redirect-uri "https://coversomeone1.cafe24.com/"
# 2) 코드 교환 + Postgres 에 저장 (DATABASE_URL 은 STEP1 값)
DATABASE_URL="postgresql://..." \
CAFE24_MALL_ID=coversomeone1 CAFE24_CLIENT_ID=... CAFE24_CLIENT_SECRET=... \
python scripts/cafe24_auth.py --code <코드> --redirect-uri "https://coversomeone1.cafe24.com/" --to-db
```
→ 이러면 `CAFE24_ACCESS_TOKEN/REFRESH_TOKEN` Secret 없이도 DB에서 바로 동작.

**방법 B — Actions 워크플로**
저장소 → Actions → **cafe24 token bootstrap** → Run workflow → `code` 입력.
(단, CI 콜드스타트가 1분 넘으면 코드 만료로 실패 가능 → 그땐 방법 A)

---

## STEP 4 — 워크플로 활성화 & 실행
- 워크플로 파일(`.github/workflows/`)이 **기본 브랜치(main)** 에 있어야 schedule 이 동작합니다.
  → 이 브랜치를 main 에 머지하세요.
- 즉시 테스트: 저장소 → Actions → **ops daily collect (all channels)** → Run workflow
  (`days`에 14 입력 시 최근 14일 백필)
- 매일 07:10 KST 자동 실행.

---

## STEP 5 — 대시보드에서 보기
대시보드/API를 **같은 `DATABASE_URL`** 로 띄우면 수집된 실데이터를 그대로 읽습니다.
```bash
DATABASE_URL="postgresql://..." uvicorn api.main:app
# 또는 같은 환경변수로 ./scripts/dev.sh / docker compose
```

---

## 채널별 토큰 만료 주의
| 채널 | 만료/회전 | 무인 동작 |
|---|---|---|
| cafe24 | access 2h / refresh 2주(회전) | ✅ DB로 자동 갱신·보존 |
| Meta | 시스템 사용자 토큰 = 장수명 | ✅ 사실상 무기한 |
| Naver SA / DataLab | 키 고정 | ✅ |
| Kakao / Google | access 토큰 단기 만료 | ⚠ 만료 시 토큰 재발급 필요(리프레시 자동화는 추후) |

> Kakao/Google 은 액세스 토큰이 짧게 만료됩니다. 우선 cafe24·Meta·Naver 로 안정 운영하고,
> Kakao/Google 리프레시 자동화가 필요하면 알려주세요(커넥터에 추가 가능).
