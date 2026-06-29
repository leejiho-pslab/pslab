#!/usr/bin/env bash
#
# 홈페이지(hyundai-dealer)를 새 전용 저장소로 한 번에 옮긴다.
# pslab 저장소를 클론한 PC에서 실행.
#
# 사용법:
#   cd pslab/hyundai-dealer
#   ./migrate-to-new-repo.sh <새저장소-git-URL> [저장소이름]
# 예:
#   ./migrate-to-new-repo.sh https://github.com/leejiho-pslab/moomoo.git moomoo
#
set -euo pipefail

REMOTE="${1:-}"
[ -z "$REMOTE" ] && { echo "사용법: $0 <새저장소-git-URL> [저장소이름]"; exit 1; }
NAME="${2:-$(basename "$REMOTE" .git)}"

SRC="$(cd "$(dirname "$0")" && pwd)"        # 이 스크립트(=hyundai-dealer)가 있는 폴더
TMP="$(mktemp -d)"
echo "▶ 새 저장소 작업 폴더: $TMP"

# 소스 복사 (빌드 산출물·의존성 제외)
cp -r "$SRC/." "$TMP/"
cd "$TMP"
rm -rf node_modules dist .astro .git

# base 경로를 새 저장소 이름으로 치환
sed -i.bak "s#/REPO_NAME/#/$NAME/#g" .github/workflows/deploy.yml && rm -f .github/workflows/deploy.yml.bak
# 마이그레이션 스크립트 자신은 새 저장소에 불필요
rm -f migrate-to-new-repo.sh

git init -b main
git add .
git commit -m "init: 현대차 딜러 홈페이지"
git remote add origin "$REMOTE"
git push -u origin main

echo ""
echo "✅ 푸시 완료 → https://github.com/${REMOTE#https://github.com/}"
echo "다음 1가지만:"
echo "  • 새 저장소 Settings → Pages → Source = 'GitHub Actions'"
echo "  → 잠시 후 https://<계정>.github.io/$NAME/ 에서 열립니다."
