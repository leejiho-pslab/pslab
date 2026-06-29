#!/usr/bin/env python3
"""
원본 영상 → 고정 폼 편집본 자동 생성.
  · youtube_edit.mp4   : 16:9, 인트로 + 본편(HDR→SDR, 자막바) + 아웃트로 CTA
  · instagram_reel.mp4 : 9:16 세로, 하이라이트 구간 + 블러배경 + 인트로/아웃트로

사용법: python edit_video.py <video> <out_dir> [reel_start] [reel_len]
"""
import sys
import subprocess
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib_brand import ffmpeg_exe, video_duration
import make_cards

EXE = ffmpeg_exe()
TM = "zscale=t=linear:npl=100,tonemap=hable,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
VENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30"]
AENC = ["-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "160k"]
INTRO_SEC, OUTRO_SEC = 2.6, 3.6
REEL_INTRO, REEL_OUTRO = 1.6, 3.0


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-1500:])
        raise SystemExit(f"ffmpeg 실패: {' '.join(cmd[:6])} ...")


def card_clip(png, dur, w, h, out):
    """정지 이미지 → 무음 오디오 포함 클립."""
    run([EXE, "-loop", "1", "-i", png, "-f", "lavfi", "-t", str(dur),
         "-i", "anullsrc=r=44100:cl=stereo",
         "-vf", f"scale={w}:{h},format=yuv420p,fps=30", "-shortest",
         *VENC, *AENC, "-y", out, "-loglevel", "error"])


def concat(clips, out):
    lst = Path(out).with_suffix(".txt")
    lst.write_text("".join(f"file '{Path(c).resolve()}'\n" for c in clips))
    # 동일 파라미터로 인코딩됐으므로 copy 우선, 실패 시 재인코딩
    r = subprocess.run([EXE, "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-c", "copy", "-y", out, "-loglevel", "error"], capture_output=True, text=True)
    if r.returncode != 0:
        run([EXE, "-f", "concat", "-safe", "0", "-i", str(lst), *VENC, *AENC, "-y", out, "-loglevel", "error"])
    lst.unlink(missing_ok=True)


def build_youtube(video, cards, work, out):
    main = str(work / "yt_main.mp4")
    run([EXE, "-i", video, "-i", str(cards / "lower.png"),
         "-filter_complex",
         f"[0:v]{TM},scale=1920:1080:force_original_aspect_ratio=decrease,"
         f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30[v0];[v0][1:v]overlay=0:0[v]",
         "-map", "[v]", "-map", "0:a?", *VENC, *AENC, "-y", main, "-loglevel", "error"])
    intro = str(work / "yt_intro.mp4"); outro = str(work / "yt_outro.mp4")
    card_clip(str(cards / "intro.png"), INTRO_SEC, 1920, 1080, intro)
    card_clip(str(cards / "outro.png"), OUTRO_SEC, 1920, 1080, outro)
    concat([intro, main, outro], out)
    return out


def build_reel(video, cards, work, out, start, length):
    main = str(work / "reel_main.mp4")
    run([EXE, "-ss", str(start), "-t", str(length), "-i", video, "-i", str(cards / "lower.png"),
         "-filter_complex",
         f"[0:v]{TM},split=2[a][b];"
         f"[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=22,eq=brightness=-0.08[bg];"
         f"[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[vv];"
         f"[vv][1:v]overlay=0:0,fps=30[v]",
         "-map", "[v]", "-map", "0:a?", *VENC, *AENC, "-y", main, "-loglevel", "error"])
    intro = str(work / "reel_intro.mp4"); outro = str(work / "reel_outro.mp4")
    card_clip(str(cards / "intro.png"), REEL_INTRO, 1080, 1920, intro)
    card_clip(str(cards / "outro.png"), REEL_OUTRO, 1080, 1920, outro)
    concat([intro, main, outro], out)
    return out


def main():
    video = sys.argv[1]
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("output")
    out_dir.mkdir(parents=True, exist_ok=True)
    work = out_dir / "_work"; work.mkdir(exist_ok=True)
    dur = video_duration(video)
    rstart = float(sys.argv[3]) if len(sys.argv) > 3 else round(dur * 0.12, 1)
    rlen = float(sys.argv[4]) if len(sys.argv) > 4 else min(30.0, max(12.0, dur * 0.5))
    if rstart + rlen > dur:
        rstart = max(0, dur - rlen)

    ch = work / "cards_h"; ch.mkdir(exist_ok=True)
    cv = work / "cards_v"; cv.mkdir(exist_ok=True)
    make_cards.intro(1920, 1080, str(ch / "intro.png")); make_cards.outro(1920, 1080, str(ch / "outro.png")); make_cards.lower_third(1920, 1080, str(ch / "lower.png"))
    make_cards.intro(1080, 1920, str(cv / "intro.png")); make_cards.outro(1080, 1920, str(cv / "outro.png")); make_cards.lower_third(1080, 1920, str(cv / "lower.png"))

    print("[edit] 유튜브 16:9 편집 중…")
    build_youtube(video, ch, work, str(out_dir / "youtube_edit.mp4"))
    print(f"[edit] 인스타 릴스 9:16 편집 중… (구간 {rstart}s~{rstart+rlen}s)")
    build_reel(video, cv, work, str(out_dir / "instagram_reel.mp4"), rstart, rlen)
    print(f"[edit] 완료 → {out_dir}/youtube_edit.mp4 , instagram_reel.mp4")


if __name__ == "__main__":
    main()
