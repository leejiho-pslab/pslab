# 홈페이지를 새 전용 저장소로 분리·배포하기

이 폴더(`hyundai-dealer/`)는 그 자체로 완결된 Astro 프로젝트입니다. 새 저장소의
**루트**에 그대로 올리면 독립된 주소(`https://<계정>.github.io/<새저장소>/`)로 배포됩니다.

> 참고: 자동화 도구의 GitHub 권한이 `leejiho-pslab/pslab` 저장소로 한정되어,
> 새 저장소 생성·푸시는 저장소 소유자가 직접 진행해야 합니다. 아래 단계대로 하면
> 5분이면 됩니다. (새 저장소를 자동화 작업 범위에 추가해 주시면 이후 코드·배포까지
> 대신 처리할 수 있습니다.)

## 1) 새 저장소 만들기
GitHub에서 새 저장소 생성 (예: 이름 `moomoo`). README 없이 빈 저장소로.

## 2) 이 폴더 내용을 새 저장소 루트로 올리기
로컬에서:

```bash
# pslab 저장소를 받은 상태에서
cd pslab/hyundai-dealer

# 이 폴더만 새 git 저장소로 초기화
rm -rf .git 2>/dev/null
git init -b main
git add .
git commit -m "init: 현대차 딜러 홈페이지"
git remote add origin https://github.com/<계정>/moomoo.git
git push -u origin main
```

> `.github/workflows/deploy.yml` 이 함께 올라가 배포 워크플로로 동작합니다.

## 3) base 경로 맞추기 (중요)
GitHub Pages는 `…github.io/<저장소이름>/` 하위 경로로 서빙되므로 base를 맞춰야
CSS·이미지가 안 깨집니다. 두 방법 중 하나:

- **방법 A (권장)**: 저장소 → Settings → Secrets and variables → Actions → **Variables**
  탭에서 `SITE_BASE` = `/moomoo/` 추가 (저장소 이름에 맞게).
- **방법 B**: `.github/workflows/deploy.yml` 의 `SITE_BASE` 기본값
  `'/REPO_NAME/'` 를 `'/moomoo/'` 로 직접 수정.

## 4) Pages 켜기
저장소 → Settings → Pages → **Build and deployment → Source = `GitHub Actions`**.

→ 잠시 후 `https://<계정>.github.io/moomoo/` 에서 홈페이지가 열립니다.
(새 저장소는 기본 브랜치가 `main` 이라, pslab에서 겪은 배포 브랜치 제한 문제도 없습니다.)

## 5) (선택) SNS 자동 업데이트
저장소 → Settings → Secrets → Actions 에 등록:
`YT_API_KEY`, `YT_CHANNEL_ID`, `IG_ACCESS_TOKEN`, `IG_USER_ID`.
매일 새벽 자동으로 유튜브·인스타 최신 콘텐츠가 갱신됩니다.

## 커스텀 도메인을 쓸 경우
보유 도메인(예: `moomoo-hyundai.com`)이 있으면 Settings → Pages → Custom domain 에
입력하고, 이때는 `SITE_BASE` 를 `/` 로 두면 됩니다(루트 서빙).
