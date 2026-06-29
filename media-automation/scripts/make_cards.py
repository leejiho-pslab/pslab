#!/usr/bin/env python3
"""인트로/아웃트로/로어서드(자막바) 이미지 카드 생성 (가로 1920×1080 · 세로 1080×1920 공용)."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib_brand import load_brand, font, hex2rgb

B = load_brand()
ACCENT = hex2rgb(B["colors"]["accent"])
DEEP = hex2rgb(B["colors"]["deep"])
INK = hex2rgb(B["colors"]["ink"])


def bg_gradient(w, h):
    """딥블루→잉크 대각 그라디언트 배경."""
    base = Image.new("RGB", (w, h), INK)
    top = Image.new("RGB", (w, h), DEEP)
    mask = Image.new("L", (1, h))
    for y in range(h):
        mask.putpixel((0, y), int(150 * (1 - y / h)))
    base = Image.composite(top, base, mask.resize((w, h)))
    # 우상단 액센트 글로우
    glow = Image.new("L", (w, h), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse((w * 0.55, -h * 0.3, w * 1.2, h * 0.6), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    acc = Image.new("RGB", (w, h), ACCENT)
    base = Image.composite(acc, base, glow)
    return base.convert("RGBA")


def center_text(d, cx, y, text, fnt, fill):
    w = d.textlength(text, font=fnt)
    d.text((cx - w / 2, y), text, font=fnt, fill=fill)
    return y + fnt.size


def intro(w, h, out):
    im = bg_gradient(w, h)
    d = ImageDraw.Draw(im)
    cx = w // 2
    big = w >= h
    eb = ImageFont.truetype(font("SemiBold"), 40 if big else 46)
    name = ImageFont.truetype(font("ExtraBold"), 150 if big else 130)
    role = ImageFont.truetype(font("Bold"), 52 if big else 56)
    sub = ImageFont.truetype(font("Medium"), 40 if big else 44)
    y = h * 0.30 if big else h * 0.34
    y = center_text(d, cx, y, B["dealership"], eb, (210, 230, 240)); y += 24
    # 액센트 라인
    d.rectangle((cx - 70, y + 6, cx + 70, y + 12), fill=ACCENT + (255,)); y += 40
    y = center_text(d, cx, y, B["name"], name, (255, 255, 255)); y += 10
    y = center_text(d, cx, y, "CAR MASTER", role, ACCENT); y += 40
    center_text(d, cx, y, B["tagline"], sub, (200, 210, 220))
    im.convert("RGB").save(out, quality=95)
    return out


def outro(w, h, out):
    im = bg_gradient(w, h)
    d = ImageDraw.Draw(im)
    cx = w // 2
    big = w >= h
    lab = ImageFont.truetype(font("SemiBold"), 46 if big else 50)
    phone = ImageFont.truetype(font("ExtraBold"), 150 if big else 120)
    name = ImageFont.truetype(font("Bold"), 56)
    sub = ImageFont.truetype(font("Medium"), 38 if big else 42)
    y = h * 0.26 if big else h * 0.30
    y = center_text(d, cx, y, "상담 문의", lab, (210, 230, 240)); y += 30
    y = center_text(d, cx, y, B["phone"], phone, (255, 255, 255)); y += 24
    y = center_text(d, cx, y, f"{B['name']} 카마스터", name, ACCENT); y += 50
    y = center_text(d, cx, y, "전화 · 문자 · 카카오톡 언제든 환영합니다", sub, (200, 210, 220)); y += 60
    center_text(d, cx, y, f"YouTube {B['youtube_handle']}", sub, (170, 185, 200))
    im.convert("RGB").save(out, quality=95)
    return out


def lower_third(w, h, out):
    """투명 PNG 자막바 (좌하단). 본 영상 위에 overlay."""
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    big = w >= h
    fn = ImageFont.truetype(font("Bold"), 38 if big else 40)
    fp = ImageFont.truetype(font("ExtraBold"), 40 if big else 42)
    txt_name = f"{B['name']} 카마스터"
    pad = 22
    margin = 56 if big else 40
    by = h - (120 if big else 320)  # 세로영상은 하단 UI 피해 위로
    # 이름 칩(액센트)
    nw = d.textlength(txt_name, font=fn)
    d.rounded_rectangle((margin, by, margin + nw + pad * 2, by + fn.size + pad * 2),
                        radius=999, fill=ACCENT + (255,))
    d.text((margin + pad, by + pad - 2), txt_name, font=fn, fill=hex2rgb("042028"))
    # 전화 칩(다크)
    px = margin + nw + pad * 2 + 16
    pw = d.textlength(B["phone"], font=fp)
    d.rounded_rectangle((px, by - 2, px + pw + pad * 2, by + fp.size + pad * 2 - 2),
                        radius=999, fill=(0, 0, 0, 160), outline=ACCENT + (255,), width=2)
    d.text((px + pad, by + pad - 4), B["phone"], font=fp, fill=(255, 255, 255))
    im.save(out)
    return out


def main():
    orient = sys.argv[1] if len(sys.argv) > 1 else "h"   # h(가로) | v(세로)
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("output/_cards")
    out_dir.mkdir(parents=True, exist_ok=True)
    w, h = (1920, 1080) if orient == "h" else (1080, 1920)
    intro(w, h, str(out_dir / "intro.png"))
    outro(w, h, str(out_dir / "outro.png"))
    lower_third(w, h, str(out_dir / "lower.png"))
    print(f"[cards] {orient} → {out_dir}")


if __name__ == "__main__":
    main()
