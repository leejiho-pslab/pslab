# 보안 토큰 재발급(회전) 가이드

이 저장소는 **공개(public)** 이고, 셋업 과정에서 일부 자격증명이 채팅/로그에 노출됐습니다.
저장소 자체엔 비밀값이 없지만(스캔 확인 완료), 안정화된 지금 **각 키를 재발급**하는 것을 권장합니다.

> 핵심 원리: 수집기는 **DB(app_kv)에 저장된 토큰을 GitHub Secret 보다 우선** 사용합니다.
> 그래서 키를 바꾸면 ① 제공자 콘솔에서 재발급 → ② GitHub Secret 갱신 → ③ **DB의 옛 토큰 비우기**
> (`cafe24 token reset` 워크플로) 순서가 필요합니다. cafe24·Meta가 여기에 해당합니다.

GitHub Secret 위치: **저장소 → Settings → Secrets and variables → Actions**

---

## 1) Neon (DATABASE_URL) — DB 비밀번호
가장 먼저(다른 작업의 토대).
1. Neon 콘솔 → 프로젝트 → **Roles** → 해당 role → **Reset password**
2. 새 비밀번호로 만들어진 **연결 문자열** 복사 (`?sslmode=require&channel_binding=require` 포함)
3. **GitHub Secret `DATABASE_URL`** 갱신
4. **Render** 대시보드 → 서비스 → Environment → `DATABASE_URL` 도 동일하게 갱신 → 재배포
5. 확인: Actions → `ops verify` (db) 실행해 정상 동작

## 2) cafe24 — Client Secret + 토큰 재인증
Client Secret 을 재발급하면 기존 access/refresh 토큰이 무효화되므로 **재인증**이 필요합니다.
1. cafe24 개발자센터 → 내 앱 → **Client Secret 재발급**
2. **GitHub Secret `CAFE24_CLIENT_SECRET`** 갱신 (CLIENT_ID/MALL_ID 는 그대로)
3. **DB 옛 토큰 비우기**: Actions → **`cafe24 token reset`** → Run
   (keys 기본값 그대로 = meta + cafe24 토큰 삭제, 또는 `cafe24_access_token,cafe24_refresh_token`)
4. **재인증(부트스트랩)**:
   - 인가 URL 생성(로컬): `python scripts/cafe24_auth.py --authorize --redirect-uri https://keek-ops-dashboard.onrender.com`
   - 브라우저로 URL 열고 **승인** → 리다이렉트 주소창의 `code=` 값 복사 (⚠ 1분 내 사용)
   - Actions → **`cafe24 token bootstrap`** → Run → `code` 붙여넣기 / `redirect_uri` 동일 입력
5. 확인: Actions → `ops daily collect` 실행 → cafe24 14건 등 정상 수집

## 3) Meta(Facebook) — App Secret + Access Token
App Secret 재설정은 노출된 장기 토큰을 무력화합니다.
1. Meta 개발자 → 앱 → 설정 → 기본 → **앱 시크릿 재설정**
2. 새 **액세스 토큰** 발급 (그래프 API 탐색기 또는 비즈니스 시스템 사용자 토큰)
3. **GitHub Secret 갱신**: `META_APP_SECRET`, `META_ACCESS_TOKEN` (APP_ID/AD_ACCOUNT_ID 그대로)
4. **DB 옛 토큰 비우기**: Actions → `cafe24 token reset` (keys 에 `meta_access_token` 포함)
5. 확인: `ops daily collect` 로그에 `ads N건` + 장기토큰 교환 200 OK

## 4) 네이버 검색광고(SearchAd) — Secret Key
1. 네이버 검색광고 → 도구 → **API 관리자 → 비밀키 재발급**
2. **GitHub Secret `NAVER_SA_SECRET_KEY`** 갱신 (API_KEY/CUSTOMER_ID 그대로)
3. 확인: `ops daily collect` 로그에 `ads` 수집 / `ops verify` [5] 광고 정상

## 5) 네이버 오픈API(경쟁사 검색/데이터랩) — Client Secret
1. 네이버 개발자센터 → 내 애플리케이션 → **Client Secret 재발급**
2. **GitHub Secret `NAVER_CLIENT_SECRET`** 갱신 (CLIENT_ID 그대로)
3. 확인: `ops daily collect` 로그에 `competitor` 수집 정상

---

## 순서 요약 (권장)
1. Neon → 2. cafe24(재발급+reset+bootstrap) → 3. Meta(재설정+reset) → 4. 네이버SA → 5. 네이버OpenAPI
→ 마지막에 **`ops daily collect` 1회 수동 실행**으로 전 채널 정상 + 일일 브리핑 `특이사항 없음` 확인.

## 참고
- 키를 바꾼 뒤 **DB 토큰을 안 비우면** 옛 토큰이 계속 쓰여 실패합니다(`cafe24 token reset` 사용).
- 수집 실패 시 일일 브리핑/검수에 `🔴 수집 실패 채널: ...` 으로 자동 표시되니 어디가 틀렸는지 바로 보입니다.
- 토큰 위치/구조는 `TOKEN-LOCATIONS.md`, 연결 절차는 `CONNECT-GUIDE.md` 참고.
