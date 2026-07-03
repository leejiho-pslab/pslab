import { useEffect, useState } from "react";
import { api } from "../api";
import type { Ga4SiteResponse } from "../types";
import { MultiLineChart } from "./MultiLineChart";

const num = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(v).toLocaleString("ko-KR");

// 초 → "2분 7초" (60초 미만이면 "45초")
const duration = (sec: number | null | undefined) => {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
};

// GA4 사이트 분석 — 선택기간 요약 타일 + 일자별 추이(방문자/세션/페이지뷰).
// GA4 미연동이거나 아직 수집 전이면 안내만 표시(광고 탭 전체를 막지 않음).
export function Ga4SitePanel({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<Ga4SiteResponse | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.ga4Site(from, to).then(setData).catch((e) => setErr(String(e)));
  }, [from, to]);

  if (err) return null;
  if (!data) return null;

  const s = data.summary;
  const noData = !s.days;

  return (
    <>
      <h2 className="section-title">GA4 사이트 분석</h2>
      <div className="card">
        {noData ? (
          <p className="muted">
            GA4 사이트 데이터가 아직 없습니다 — GA4 연동(GA4_PROPERTY_ID + 서비스계정) 후
            수집 워크플로를 실행하면 방문자·체류시간·페이지뷰가 여기에 표시됩니다.
          </p>
        ) : (
          <>
            <div className="ch-metrics">
              <div>
                <span>사이트 방문자</span>
                <b>{num(s.visitors)}</b>
              </div>
              <div>
                <span>세션수</span>
                <b>{num(s.sessions)}</b>
              </div>
              <div>
                <span>페이지뷰</span>
                <b>{num(s.page_views)}</b>
              </div>
              <div>
                <span>평균 체류시간</span>
                <b>{duration(s.avg_session_duration)}</b>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              세션당 페이지 {s.pages_per_session ?? "—"} · 기간 {data.from} ~ {data.to} ({s.days}일)
            </p>
          </>
        )}
      </div>
      {!noData && (
        <MultiLineChart
          title="방문자 · 세션 · 페이지뷰 추이"
          series={["방문자", "세션", "페이지뷰"]}
          rows={data.trend.map((r) => ({
            date: r.date,
            방문자: r.visitors ?? 0,
            세션: r.sessions ?? 0,
            페이지뷰: r.page_views ?? 0,
          }))}
        />
      )}
    </>
  );
}
