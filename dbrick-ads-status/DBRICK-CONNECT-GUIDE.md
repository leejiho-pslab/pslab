# 디브릭 광고 대시보드 — 연결 가이드 (순차 진행)

디브릭(dbrick.co.kr, 프리미엄 1:1 맞춤형 인테리어 디자인)은 **자사몰이 없는 서비스업**이라
"카페24 운영현황"은 제외하고, **광고 / 광고 히스토리 / 경쟁사 모니터링** 3개 탭만 구성했다.
(`온라인-광고` 스킬 기준. 자사몰이 생기면 `카페24-운영현황` 스킬을 별도로 붙이면 됨.)

뼈대는 이미 다 만들어져 있다. 아래 순서대로 **키/계정만 채우면** 실데이터가 자동으로 쌓인다.
쉬운 것부터, 값을 채운 채널만 수집되고 나머지는 자동 스킵된다.

> ⚠️ **GitHub Secrets 이름 주의**: 이 저장소(`pslab`)는 keek 대시보드와 저장소를 공유한다.
> GitHub 저장소 Secrets 는 워크플로별이 아니라 **저장소 전체에서 공유**되므로, keek 이 이미
> 쓰고 있는 `DATABASE_URL`/`META_ACCESS_TOKEN`/`NAVER_SA_API_KEY`/`NAVER_CLIENT_ID` 같은
> 이름으로 그대로 등록하면 keek 의 실제 광고계정 자격증명을 덮어쓰게 된다.
> 그래서 **dbrick 의 GitHub Secret 이름은 전부 `DBRICK_` 접두어**를 붙인다
> (`DBRICK_DATABASE_URL`, `DBRICK_META_ACCESS_TOKEN` 등 — 아래 안내대로).
> ※ Render 시크릿은 서비스별로 완전히 분리 저장되므로 접두어 없이 원래 이름 그대로 입력하면 된다.

---

## 0. DATABASE_URL — 최우선 (5분) ⛳ 이게 없으면 데이터가 안 쌓임
1. https://neon.tech 가입(깃허브 로그인) → **Create project** (디브릭 전용 프로젝트로 새로 생성 — keek 과 DB 공유하지 말 것)
2. 대시보드의 **Connection string** 복사 (`postgresql://...?sslmode=require`)
3. 저장소 시크릿에 등록: `Settings → Secrets and variables → Actions → New repository secret`
   - Name: **`DBRICK_DATABASE_URL`** / Value: 복사한 문자열
   - (`DATABASE_URL` 이라는 이름은 keek 이 이미 쓰고 있어 등록 시 "이미 존재합니다" 충돌이 남 → 반드시 `DBRICK_` 접두어로)
4. 확인: Actions 탭 → `dbrick ads daily collect` → **Run workflow** 로 수동 1회 실행

## 1. Meta 광고(인스타그램/페이스북) — 가장 쉬움 (10분)
디브릭처럼 포트폴리오 비주얼이 강점인 브랜드는 메타 광고 비중이 큰 경우가 많다.
1. https://developers.facebook.com → 앱 생성(무료) → **Marketing API** 추가
2. 권한 `ads_read` 로 액세스 토큰 발급 (시스템 사용자 토큰 권장 — 안 끊김)
3. 광고계정 ID 확인 (`act_` 뒤 숫자만)
4. 시크릿 등록: **`DBRICK_META_ACCESS_TOKEN`**, **`DBRICK_META_AD_ACCOUNT_ID`**
   - (선택, 권장) **`DBRICK_META_APP_ID`**, **`DBRICK_META_APP_SECRET`** 도 같이 넣으면 실행마다
     60일 장기토큰을 자동 갱신해서 계속 무인으로 돈다. 안 넣으면 60일마다 토큰을 손으로 갱신해야 함.
5. `dbrick-ads-status/config/sources.yaml` 의 `ads[channel: meta].account_id` 도 같이 채워두면
   서빙 시 계정명 매칭이 더 안정적이다(선택).

## 2. 네이버 검색광고(SA) — 파워링크 (10분)
"OO동 인테리어", "아파트 리모델링" 같은 지역/의도 검색 키워드가 핵심이라 인테리어 업종은
네이버 파워링크 비중이 크다.
1. https://searchad.naver.com → 도구 → **API 사용 관리**에서 라이선스 발급(무료)
2. 액세스 라이선스(API_KEY), 비밀키(SECRET_KEY), CUSTOMER_ID(광고주 ID) 확인
3. 시크릿 등록: **`DBRICK_NAVER_SA_API_KEY`**, **`DBRICK_NAVER_SA_SECRET_KEY`**, **`DBRICK_NAVER_SA_CUSTOMER_ID`**

## 3. 네이버 경쟁사 모니터링 (5분)
1. https://developers.naver.com → 애플리케이션 등록(무료) → **데이터랩(검색어트렌드)** + **검색** API 사용 설정
2. 시크릿 등록: **`DBRICK_NAVER_CLIENT_ID`**, **`DBRICK_NAVER_CLIENT_SECRET`**
3. `dbrick-ads-status/config/sources.yaml` 의 `competitors:` 를 **실제 비교 대상**으로 확정해서 수정
   (지금은 아파트멘터리/한샘리하우스로 초안만 넣어둠 — 실제 경쟁사 리스트를 알려주면 바로 반영)

## 4. (후순위) 구글 애즈 / 카카오모먼트
토큰 승인 절차가 길다. 0~3번이 돌아가는 걸 먼저 확인한 뒤 여유 있을 때 진행해도 된다.
- Google: `DBRICK_GOOGLE_ADS_DEVELOPER_TOKEN`, `DBRICK_GOOGLE_ADS_ACCESS_TOKEN`, `DBRICK_GOOGLE_ADS_CUSTOMER_ID`, `DBRICK_GOOGLE_ADS_LOGIN_CUSTOMER_ID`
- Kakao: `DBRICK_KAKAO_ACCESS_TOKEN`, `DBRICK_KAKAO_AD_ACCOUNT_ID`

## 5. 배포 (Render, 20분) — URL 로 접속 가능한 대시보드
1. https://render.com 가입(깃허브 로그인)
2. **New → Blueprint** → 이 저장소 연결 → 기본 브랜치 선택
3. 루트 `render.yaml` 이 `dbrick-ads-dashboard` 서비스를 자동 인식 → 시크릿 입력란에
   위에서 만든 키들의 **실제 값**을 붙여넣기(이름은 Render 화면에 이미 `DATABASE_URL` 등으로
   고정 표시됨 — `DBRICK_` 접두어는 GitHub Secrets 저장소 전체 충돌 방지용이라 Render 에는 안 씀)
4. **Deploy** → `https://dbrick-ads-dashboard.onrender.com` 발급
   (GitHub Actions 의 `DBRICK_DATABASE_URL` 과 Render 의 `DATABASE_URL` 에 **같은 Neon connection
   string 값**을 넣어야 수집된 실데이터가 화면에 뜬다)

## 6. 백필 (과거 데이터 채우기)
- Actions 탭 → `dbrick ads daily collect` → **Run workflow** → `days`에 `30` 입력
- 소재(광고 히스토리)/경쟁사는 스냅샷 성격이라 과거 백필이 제한적일 수 있음(정상)

## 7. 검증
- `dbrick api smoke (live onrender)` 워크플로 수동 실행 → 모든 엔드포인트 200 확인
- `dbrick dashboard keep-alive` 는 10분마다 자동으로 돌며 Render 슬립을 방지(별도 설정 불필요, main 머지만 하면 됨)

---

## ✅ "완성" 정의
0(DB 누적) + 1(Meta) + 2(네이버SA) + 3(경쟁사) + 5(배포) 가 끝나면
**실데이터가 매일 자동 수집·누적되고, 공개 URL 로 보이는 디브릭 광고 대시보드** 완성.
Google/Kakao 는 있으면 좋고 없어도 나머지 채널만으로 정상 동작한다.

## 막히면
각 단계의 에러 메시지 / Actions 로그 / smoke 워크플로 출력을 그대로 붙여주면 바로 잡아드립니다.
