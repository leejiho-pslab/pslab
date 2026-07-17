# 대구일색 전용 클라이언트 설정 (기존 업체와 분리)

이 저장소의 기본 브랜치(`claude/eager-lamport-mX0eT`)와 공용 대시보드(`docs/index.html`)는
**다른 업체(pslab)** 소유다. 대구일색은 섞이지 않도록 이 폴더와 아래 경로에서만 관리한다.

| 대시보드(라이브 스냅샷) | https://claude.ai/code/artifact/55d76711-dff6-48e2-ab8b-856a3fc0526d |
| 자산 | 경로 |
|---|---|
| 클라이언트 설정 | `clients-daeguis/daeguis.json` |
| 데이터(디자인·지침·리서치) | `data/clients/daeguis/` |
| 전용 대시보드 | `docs/daeguis/index.html` |
| 작업 브랜치 | `claude/sns-automation-brand-research-th4yll` |

## 대시보드 재생성

```bash
npx tsx src/cli.ts dashboard --clients-dir ./clients-daeguis --out ./docs/daeguis/index.html
```

공용 `docs/index.html` 재생성(`--clients-dir ./clients` 기본값)에는 대구일색이 포함되지 않는다.

## 8월 온보딩 시 배포 결정 (권장: 전용 저장소)

GitHub Pages·cron 워크플로는 **기본 브랜치에서만** 동작하므로, 무인 자동화를 켜려면 둘 중 하나:
1. **대구일색 전용 저장소 신설(권장)** — 이 브랜치 내용을 통째로 복사, 채널 시크릿도 독립.
   (현 세션의 GitHub 앱 권한으로는 저장소 생성 불가 → 담당자가 repo 생성 후 요청하면 전체 셋업 진행)
2. 기본 브랜치에 병합해 멀티클라이언트로 공용 운영 — 단, 채널 토큰 시크릿(PSLAB_*)이 저장소당
   1세트라 두 업체가 같은 채널을 쓰면 계정이 충돌한다. 별도 저장소가 안전.
