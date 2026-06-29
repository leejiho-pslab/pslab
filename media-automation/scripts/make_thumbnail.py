#!/usr/bin/env python3
"""
원본 영상 → 유튜브/인스타그램 썸네일 자동 생성.
- 대표 프레임 자동 선택(가장 선명한 프레임) 후 브랜드 디자인 합성
- 유튜브: 1280×720 (16:9), 인스타: 1080×1350 (4:5) — 서로 다른 레이아웃/문구

사용법:
  python make_thumbnail.py <video> <out_dir>
"""
import sys
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib_brand import load_brand, font, hex2rgb, extract_frame, video_duration, pick_keyframe_times

B = load_brand()
ACCENT = hex2rgb(B["colors"]["accent"])
DEEP = hex2rgb(B["colors"]["deep"])
INK = hex2rgb(B["colors"]["ink"])


def sharpness(path: str) -> float:
    """대비/디테일 기반 선명도 점수 (numpy 있으면 정밀, 없으면 0)."""
    try:
        import numpy as np
        im = Image.open(path).convert("L").resize((320, 180))
        a = np.asarray(im, dtype="float32")
        gx = np.diff(a, axis=1)
        gy = np.diff(a, axis=0)
        return float(gx.var() + gy.var())
    except Exception:
        return 0.0


def best_frame(video: str, work: Path) -> str:
    dur = video_duration(video)
    cands = pick_keyframe_times(dur)
    best, score = None, -1
    for i, t in enumerate(cands):
        p = str(work / f"cand_{i}.jpg")
        try:
            extract_frame(video, p, t)
        except Exception:
            continue
        s = sharpness(p)
        if s > score:
            best, score = p, s
    return best or str(work / "cand_0.jpg")


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    """대상 비율에 맞춰 꽉 채우기(cover) 크롭."""
    sr, tr = im.width / im.height, w / h
    if sr > tr:
        nw = int(im.height * tr); im = im.crop(((im.width - nw) // 2, 0, (im.width + nw) // 2, im.height))
    else:
        nh = int(im.width / tr); im = im.crop((0, (im.height - nh) // 2, im.width, (im.height + nh) // 2))
    return im.resize((w, h), Image.LANCZOS)


def vgrad(w: int, h: int, top_a: int, bot_a: int, color=(0, 0, 0)) -> Image.Image:
    """세로 알파 그라디언트 오버레이."""
    g = Image.new("L", (1, h))
    for y in range(h):
        g.putpixel((0, y), int(top_a + (bot_a - top_a) * y / h))
    g = g.resize((w, h))
    ov = Image.new("RGBA", (w, h), color + (0,))
    ov.putalpha(g)
    return ov


def fit_font(draw, text, weight, max_w, start, min_size=28):
    s = start
    while s > min_size:
        f = ImageFont.truetype(font(weight), s)
        if draw.textlength(text, font=f) <= max_w:
            return f
        s -= 2
    return ImageFont.truetype(font(weight), min_size)


def chip(draw, xy, text, fnt, pad=(22, 12), bg=(0, 0, 0, 140), fg=(255, 255, 255), radius=999, outline=None):
    x, y = xy
    tw = draw.textlength(text, font=fnt)
    th = fnt.size
    box = (x, y, x + tw + pad[0] * 2, y + th + pad[1] * 2)
    draw.rounded_rectangle(box, radius=radius, fill=bg, outline=outline, width=2 if outline else 0)
    draw.text((x + pad[0], y + pad[1] - 2), text, font=fnt, fill=fg)
    return box


def make_youtube(frame: str, out: str):
    W, H = 1280, 720
    base = cover(Image.open(frame).convert("RGB"), W, H).convert("RGBA")
    # 좌측 어둡게(텍스트 가독성) + 하단 그라디언트
    left = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    lg = Image.new("L", (W, 1))
    for x in range(W):
        lg.putpixel((x, 0), int(210 * max(0, 1 - x / (W * 0.72))))
    lg = lg.resize((W, H))
    panel = Image.new("RGBA", (W, H), INK + (255,)); panel.putalpha(lg)
    base = Image.alpha_composite(base, panel)
    base = Image.alpha_composite(base, vgrad(W, H, 0, 150))
    d = ImageDraw.Draw(base)

    # 액센트 세로 바
    d.rectangle((70, 150, 84, 470), fill=ACCENT + (255,))
    # 후킹 문구 (1행 화이트 / 2행 액센트)
    lines = B["hooks"]["youtube_main"].split("\n")
    y = 158
    f1 = fit_font(d, max(lines, key=len), "ExtraBold", 760, 96)
    for i, ln in enumerate(lines):
        col = (255, 255, 255) if i == 0 else ACCENT
        d.text((108, y), ln, font=f1, fill=col)
        y += int(f1.size * 1.12)
    # 서브 문구
    fs = ImageFont.truetype(font("SemiBold"), 38)
    d.text((110, y + 8), B["hooks"]["youtube_sub"], font=fs, fill=(230, 235, 240))

    # 하단 정보 칩
    fn = ImageFont.truetype(font("Bold"), 34)
    chip(d, (108, H - 92), f"{B['name']} 카마스터", fn, bg=ACCENT + (255,), fg=hex2rgb("042028"))
    fp = ImageFont.truetype(font("ExtraBold"), 40)
    chip(d, (360, H - 96), B["phone"], fp, bg=(0, 0, 0, 150), fg=(255, 255, 255), outline=ACCENT + (255,))
    # 우상단 브랜드
    fb = ImageFont.truetype(font("Bold"), 30)
    t = "HYUNDAI · GENESIS"
    d.text((W - d.textlength(t, font=fb) - 60, 54), t, font=fb, fill=(255, 255, 255))

    base.convert("RGB").save(out, quality=92)
    return out


def make_instagram(frame: str, out: str):
    W, H = 1080, 1350
    base = Image.new("RGBA", (W, H), INK + (255,))
    photo_h = 880
    ph = cover(Image.open(frame).convert("RGB"), W, photo_h).convert("RGBA")
    ph = Image.alpha_composite(ph, vgrad(W, photo_h, 40, 180))
    base.paste(ph, (0, 0))
    d = ImageDraw.Draw(base)

    # 상단 브랜드 칩
    fb = ImageFont.truetype(font("Bold"), 34)
    chip(d, (48, 48), B["dealership"], fb, bg=(0, 0, 0, 150), fg=(255, 255, 255), outline=ACCENT + (255,))

    # 하단 패널 텍스트
    d.rectangle((0, photo_h, W, H), fill=INK + (255,))
    d.rectangle((0, photo_h, W, photo_h + 8), fill=ACCENT + (255,))
    lines = B["hooks"]["instagram_main"].split("\n")
    y = photo_h + 60
    f1 = fit_font(d, max(lines, key=len), "ExtraBold", W - 120, 110)
    for i, ln in enumerate(lines):
        col = (255, 255, 255) if i == 0 else ACCENT
        d.text((60, y), ln, font=f1, fill=col)
        y += int(f1.size * 1.1)
    fcta = ImageFont.truetype(font("SemiBold"), 40)
    chip(d, (60, H - 130), f"{B['hooks']['instagram_sub']}  ·  {B['phone']}", fcta,
         bg=ACCENT + (255,), fg=hex2rgb("042028"))

    base.convert("RGB").save(out, quality=92)
    return out


def main():
    video = sys.argv[1]
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("output")
    out_dir.mkdir(parents=True, exist_ok=True)
    work = out_dir / "_work"; work.mkdir(exist_ok=True)
    frame = best_frame(video, work)
    yt = make_youtube(frame, str(out_dir / "thumb_youtube.jpg"))
    ig = make_instagram(frame, str(out_dir / "thumb_instagram.jpg"))
    print(f"[thumb] youtube  → {yt}")
    print(f"[thumb] instagram→ {ig}")


if __name__ == "__main__":
    main()
