import { useEffect, useState } from "react";
import { api } from "../api";
import type { DigestResponse } from "../types";

// 상단 일일 브리핑 배너 — 대시보드를 열자마자 핵심 KPI 요약 + 이상치 알림을 한눈에.
export function BriefingBanner({ date }: { date?: string }) {
  const [data, setData] = useState<DigestResponse | null>(null);
  const [err, setErr] = useState(false);

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

  return (
    <section className="briefing card" aria-label="일일 브리핑">
      <div className="briefing-head">
        <span className="briefing-title">오늘의 브리핑</span>
        {data?.date && <span className="muted">{data.date}</span>}
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
        </>
      )}
    </section>
  );
}
