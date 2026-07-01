import { useEffect, useState } from "react";
import { api } from "../api";
import type { DigestCommentary, DigestResponse } from "../types";

// 상단 일일 브리핑 배너 — 핵심 KPI 요약 + 이상치 알림 + 전문 분석 코멘트.
export function BriefingBanner({ date }: { date?: string }) {
  const [data, setData] = useState<DigestResponse | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    setData(null);
    setErr(false);
    api
      .digest(date)
      .then((d) => alive && setData(d))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [date]);

  if (err || (data && data.lines.length === 0 && data.alerts.length === 0)) return null;
  const c = data?.commentary;
  const hasComment =
    !!c && (c.core.length + c.movers.length + c.anomalies.length + c.ads.length > 0);

  return (
    <section className="briefing card" aria-label="일일 브리핑">
      <div className="briefing-head">
        <span className="briefing-title">오늘의 브리핑</span>
        {data?.date && <span className="muted">{data.date}</span>}
        {hasComment && (
          <button className="briefing-toggle" onClick={() => setOpen((v) => !v)}>
            {open ? "분석 접기 ▲" : "분석 코멘트 ▼"}
          </button>
        )}
      </div>
      {!data ? (
        <div className="muted">불러오는 중…</div>
      ) : (
        <>
          <ul className="briefing-lines">
            {data.lines.map((ln, i) => (
              <li key={i}>{ln}</li>
            ))}
          </ul>
          {data.alerts.length > 0 && (
            <div className="briefing-alerts">
              {data.alerts.map((a, i) => (
                <span key={i} className={`chip ${a.level === "warning" ? "chip-warn" : "chip-info"}`}>
                  {a.level === "warning" ? "🔴" : "🔵"} {a.message}
                </span>
              ))}
            </div>
          )}
          {hasComment && open && <Commentary c={c!} />}
        </>
      )}
    </section>
  );
}

function Commentary({ c }: { c: DigestCommentary }) {
  return (
    <div className="commentary">
      {c.headline && <p className="commentary-headline">{c.headline}</p>}
      <div className="commentary-grid">
        <Section title="핵심지표 (전일·전주·전년)" items={c.core} />
        <Section title="7일 평균 대비 급등락" items={c.movers} />
        <Section title="이상치·신규 등장" items={c.anomalies} emptyText="특이 이상치 없음" />
        <Section title="광고 지표 (당일·전일·전주)" items={c.ads} emptyText="광고 데이터 없음" accent />
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  emptyText,
  accent,
}: {
  title: string;
  items: string[];
  emptyText?: string;
  accent?: boolean;
}) {
  return (
    <div className={`commentary-sec${accent ? " accent" : ""}`}>
      <div className="commentary-sec-title">{title}</div>
      {items.length === 0 ? (
        <p className="muted commentary-empty">{emptyText ?? "—"}</p>
      ) : (
        <ul>
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
