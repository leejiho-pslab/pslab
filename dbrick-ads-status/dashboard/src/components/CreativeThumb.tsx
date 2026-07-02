// 소재 이미지. src(실제 이미지 URL)가 있으면 이미지를, 없으면 id 해시 색 + 이니셜 placeholder.
function hashHue(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function CreativeThumb({
  id,
  name,
  size = 52,
  src,
  ratio,
}: {
  id: string;
  name: string;
  size?: number;
  src?: string | null;
  ratio?: boolean; // true면 카드 상단 와이드 썸네일(고정 높이)
}) {
  if (src) {
    return (
      <img
        className={ratio ? "thumb-img wide" : "thumb-img"}
        src={src}
        alt={name}
        loading="lazy"
        style={ratio ? undefined : { width: size, height: size }}
      />
    );
  }
  const initials = (name.replace(/[^가-힣A-Za-z0-9]/g, "").slice(0, 2) || id.slice(-2)).toUpperCase();
  const hue = hashHue(id);
  const box = ratio
    ? { width: "100%", height: 150, fontSize: 30 }
    : { width: size, height: size, fontSize: size / 3 };
  return (
    <div
      className={ratio ? "thumb wide" : "thumb"}
      style={{
        ...box,
        background: `linear-gradient(135deg, hsl(${hue} 65% 55%), hsl(${(hue + 40) % 360} 65% 45%))`,
      }}
      title={name}
    >
      {initials}
    </div>
  );
}
