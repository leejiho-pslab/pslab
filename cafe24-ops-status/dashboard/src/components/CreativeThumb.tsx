// 소재 이미지 자리표시 — 실제 소재 이미지는 live 연동(메타/구글 리포트) 시 교체.
// id 해시로 안정적인 색을 만들고 소재명 이니셜을 표시한다.
function hashHue(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function CreativeThumb({ id, name, size = 52 }: { id: string; name: string; size?: number }) {
  const initials = (name.replace(/[^가-힣A-Za-z0-9]/g, "").slice(0, 2) || id.slice(-2)).toUpperCase();
  const hue = hashHue(id);
  return (
    <div
      className="thumb"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 65% 55%), hsl(${(hue + 40) % 360} 65% 45%))`,
        fontSize: size / 3,
      }}
      title={name}
    >
      {initials}
    </div>
  );
}
