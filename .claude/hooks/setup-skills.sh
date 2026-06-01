#!/usr/bin/env bash
# SessionStart hook: wire up bundled plugins/skills that need out-of-repo state.
#
# - understand-anything's dashboard skill resolves its plugin root via the
#   ~/.understand-anything-plugin symlink. Recreate it on every fresh
#   (ephemeral) session so /understand-dashboard can find packages/dashboard.
# - watch needs yt-dlp + ffmpeg; install yt-dlp if it's missing.
#
# Runs quietly; never fails the session.
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/.claude/plugins/understand-anything-plugin"

# 1) understand-anything plugin-root symlink (for the dashboard skill)
if [ -d "$PLUGIN_DIR" ]; then
  ln -sfn "$PLUGIN_DIR" "$HOME/.understand-anything-plugin" 2>/dev/null || true
fi

# 2) watch dependency: yt-dlp (ffmpeg is a system package, install separately)
if ! command -v yt-dlp >/dev/null 2>&1 && ! python3 -m yt_dlp --version >/dev/null 2>&1; then
  python3 -m pip install --quiet yt-dlp >/dev/null 2>&1 || true
fi

exit 0
