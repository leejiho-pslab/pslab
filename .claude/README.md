# Bundled Claude Code skills

`/plugin` (marketplace install) isn't available in Claude Code on the web, so
these plugins were installed manually by copying their skill/agent/command
files into this repo. They load automatically as **project skills** from
`.claude/` in any Claude Code session opened on this repo.

## What's installed

| Source plugin | Origin | Components |
|---|---|---|
| **andrej-karpathy-skills** | [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | `karpathy-guidelines` skill |
| **superpowers** | [obra/superpowers](https://github.com/obra/superpowers) | 14 skills (TDD, debugging, brainstorming, plans, code review, worktrees, …) |
| **watch** (claude-video) | [bradautomates/claude-video](https://github.com/bradautomates/claude-video) | `watch` skill + `/watch` command + `scripts/` |
| **understand-anything** | [Lum1104/Understand-Anything](https://github.com/Lum1104/Understand-Anything) | 8 `understand-*` skills, 9 agents, `packages/` (dashboard) |

Layout:
- `.claude/skills/` — 24 skills
- `.claude/agents/` — understand-anything analyzer agents
- `.claude/commands/` — `/watch`
- `.claude/plugins/understand-anything-plugin/` — plugin source kept so the
  `understand-dashboard` skill can resolve `packages/dashboard`
- `.claude/hooks/setup-skills.sh` — SessionStart hook (see below)
- `.claude/settings.json` — registers the SessionStart hook

## External dependencies

- **watch**: needs `yt-dlp` (installed via pip) and `ffmpeg` (system package).
  An optional `GROQ_API_KEY` or `OPENAI_API_KEY` enables the Whisper transcript
  fallback for videos that have no native captions.
- **understand-dashboard**: needs Node deps under
  `.claude/plugins/understand-anything-plugin` (`pnpm install`). The other
  `understand-*` analysis skills are self-contained (LLM + bundled Python).

## SessionStart hook

Because web sessions are ephemeral, `.claude/hooks/setup-skills.sh` runs on each
session start to:
1. recreate the `~/.understand-anything-plugin` symlink the dashboard skill
   looks for, and
2. install `yt-dlp` if it's missing.

`ffmpeg` and the optional Whisper API key must be provided by the environment.
