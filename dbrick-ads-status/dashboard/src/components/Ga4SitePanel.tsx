import { useEffect, useState } from "react";
import { api } from "../api";
import { formatDelta } from "../format";
import type { Ga4SiteResponse, Ga4ChannelsResponse, Ga4PagesResponse } from "../types";
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

// 매체(source/medium) 라벨을 조금 더 읽기 쉽게 (광고 매체엔 배지 색 힌트)
const isAd = (sm: string) => /(cpc|cpm|display|paid|social)/i.test(sm);

// GA4 사이트 분석 — 요약 타일 + 매체별 표 + 인기 페이지 + 신규/재방문 추이.
// GA4 미연동이거나 아직 수집 전이면 안내만 표시(광고 탭 전체를 막지 않음).
export function Ga4SitePanel({
  from,
  to,
  cmpFrom,
  cmpTo,
}: {
  from: string;
  to: string;
  cmpFrom: string;
  cmpTo: string;
}) {
  const [data, setData] = useState<Ga4SiteResponse | null>(null);
  const [channels, setChannels] = useState<Ga4ChannelsResponse | null>(null);
  const [pages, setPages] = useState<Ga4PagesResponse | null>(null);

  useEffect(() => {
    api.ga4Site(from, to).then(setData).catch(() => {});
    api.ga4Channels(from, to, cmpFrom, cmpTo).then(setChannels).catch(() => {});
    api.ga4Pages(from, to, 10).then(setPages).catch(() => {});
  }, [from, to, cmpFrom, cmpTo]);

  if (!data) return null;
  const s = data.summary;
  const noData = !s.days;

  return (
    <>
      <h2 className="section-title">GA4 사이트 분석</h2>

      {noData ? (
        <div className="card">
          <p className="muted">
            GA4 사이트 데이터가 아직 없습니다 — GA4 연동(GA4_PROPERTY_ID + 서비스계정) 후
            수집 워크플로를 실행하면 방문자·체류시간·페이지뷰·매체·인기 페이지가 여기에 표시됩니다.
          </p>
        </div>
      ) : (
        <>
          {/* 요약 타일 */}
          <div className="card">
            <div className="ch-metrics six">
              <div><span>방문자</span><b>{num(s.visitors)}</b></div>
              <div><span>세션수</span><b>{num(s.sessions)}</b></div>
              <div><span>페이지뷰</span><b>{num(s.page_views)}</b></div>
              <div><span>평균 체류시간</span><b>{duration(s.avg_session_duration)}</b></div>
              <div><span>신규 방문</span><b>{num(s.new_users)}</b></div>
              <div><span>재방문</span><b>{num(s.returning_users)}</b></div>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              세션당 페이지 {s.pages_per_session ?? "—"} · 기간 {data.from} ~ {data.to} ({s.days}일)
            </p>
          </div>

          {/* 매체별 세션·활성사용자·전환 */}
          {channels && channels.rows.length > 0 && (
            <div className="card">
              <h2>매체별 유입 · 전환 (소스/매체)</h2>
              <div className="table-wrap">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>소스 / 매체</th>
                      <th>세션수</th>
                      <th>세션 증감</th>
                      <th>활성 사용자</th>
                      <th>전환수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.rows.map((r) => {
                      const dd = formatDelta(r.sessions_delta);
                      return (
                        <tr key={r.source_medium}>
                          <td className="left strong">
                            {r.source_medium}
                            {isAd(r.source_medium) && <span className="badge" style={{ marginLeft: 6 }}>광고</span>}
                          </td>
                          <td>{num(r.sessions)}</td>
                          <td className={`delta ${dd.cls}`}>{dd.text}</td>
                          <td>{num(r.users)}</td>
                          <td className="strong">{num(r.conversions)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="two-col">
            {/* 인기 페이지 TOP */}
            {pages && pages.rows.length > 0 && (
              <div className="card">
                <h2>인기 페이지 TOP (조회수)</h2>
                <div className="table-wrap">
                  <table className="grid-table">
                    <thead>
                      <tr><th>페이지</th><th>조회수</th></tr>
                    </thead>
                    <tbody>
                      {pages.rows.map((r) => (
                        <tr key={r.page}>
                          <td className="left">{r.page}</td>
                          <td className="strong">{num(r.views)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 신규 vs 재방문 추이 */}
            <div className="card">
              <MultiLineChart
                title="신규 · 재방문 추이"
                series={["신규", "재방문"]}
                rows={data.trend.map((r) => ({
                  date: r.date,
                  신규: r.new_users ?? 0,
                  재방문: r.returning_users ?? 0,
                }))}
              />
            </div>
          </div>

          {/* 방문 규모 추이 */}
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
        </>
      )}
    </>
  );
}
