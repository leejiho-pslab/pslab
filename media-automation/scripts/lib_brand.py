"""공용 헬퍼: 브랜드 설정 로드, 폰트 경로, 색상 변환, 영상에서 대표 프레임 추출."""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "fonts"


def load_brand() -> dict:
    with open(ROOT / "brand.json", encoding="utf-8") as f:
        return json.load(f)


def font(weight: str = "Bold"):
    """Pretendard 폰트 파일 경로 (Bold/ExtraBold/SemiBold/Medium/Regular)."""
    p = FONTS / f"Pretendard-{weight}.otf"
    if not p.exists():
        raise FileNotFoundError(p)
    return str(p)


def hex2rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def ffmpeg_exe() -> str:
    """imageio-ffmpeg 번들 우선, 없으면 PATH의 ffmpeg."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def video_duration(video: str) -> float:
    exe = ffmpeg_exe()
    out = subprocess.run([exe, "-i", video], capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "Duration" in line:
            t = line.split("Duration:")[1].split(",")[0].strip()
            hh, mm, ss = t.split(":")
            return int(hh) * 3600 + int(mm) * 60 + float(ss)
    return 0.0


def extract_frame(video: str, out_path: str, at_sec: float, tonemap: bool = True):
    """지정 시각의 프레임 1장 추출. HDR(HLG/PQ) → SDR 톤매핑 포함."""
    exe = ffmpeg_exe()
    vf = ("zscale=t=linear:npl=100,tonemap=hable,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
          if tonemap else "format=yuv420p")
    cmd = [exe, "-ss", str(at_sec), "-i", video, "-vf", vf, "-frames:v", "1", "-y", out_path,
           "-loglevel", "error"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(out_path):
        # 톤매핑 실패 시(비 HDR 소스 등) 단순 추출로 폴백
        subprocess.run([exe, "-ss", str(at_sec), "-i", video, "-frames:v", "1", "-y", out_path,
                        "-loglevel", "error"], check=True)


def pick_keyframe_times(duration: float, n: int = 6):
    """대표 프레임 후보 시각(초) — 양 끝 제외 균등 분포."""
    return [round(duration * f, 2) for f in [0.12, 0.28, 0.42, 0.58, 0.72, 0.88]][:n]
