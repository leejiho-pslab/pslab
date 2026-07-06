import { useEffect, useState } from "react";
import { api } from "../api";
import { formatValue, formatDelta } from "../format";
import { computeRanges, type Preset, type Ranges } from "../periods";
import { daysBefore } from "../util";
import type { AdsChannel, AdsOverview, AdsTrendRow } from "../types";
import { PeriodSelector } from "../components/PeriodSelector";
import { KpiDelta } from "../components/KpiDelta";
import { AdsTrendChart } from "../components/AdsTrendChart";
import { Loading, ErrorState } from "../components/States";

const CH_LABEL: Record<string, string> = {
  meta: "Meta", google: "Google", naver: "Naver", kakao: "Kakao",
  naver_powerlink: "네이버 파워링크", naver_place: "네이버 플레이스", naver_other: "네이버 기타",
};
const won = (v: number) => formatValue(v, "currency");
const num = (v: number) => Math.round(v).toLocaleString("ko-KR");
const pct = (cur: number | null, prev: number | null | undefined): number | null =>
  cur == null || prev == null || prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10;

export function AdsPage({ date }: { date: string }) {
  const [ranges, setRanges] = useState<Ranges>(() => computeRanges(date, "week"));
  const [data, setData] = useState<AdsOverview | null>(null);
  const [chTrend, setChTrend] = useState<Record<string, AdsTrendRow[]>>({});
  const [err, setErr] = useState("");

  useEffect(() => setRanges(computeRanges(date, "week")), [date]);
  useEffect(() => {
    api.adsOverview(ranges).then(setData).catch((e) => setErr(String(e)));
  }, [ranges]);
  // 30일 추이는 선택기간과 무관하게 상시 표시
  useEffect(() => {
    api.adsChannelTrend(daysBefore(date, 29), date).then((r) => setChTrend(r.trend)).catch(() => {});
  }, [date]);

  const onChange = (r: Ranges, _p: Preset) => setRanges(r);
  const s = data?.selected.summary;
  const d = data?.deltas ?? {};
  const channels = data?.selected.channels ?? [];
  const cmpMap = new Map((data?.comparison.channels ?? []).map((c) => [c.channel, c]));

  return (
    <>
      <PeriodSelector base={date} ranges={ranges} onChange={onChange} />
      {err ? (
        <ErrorState error={err} />
      ) : !data ? (
        <Loading rows={3} />
      ) : (
        <>
          {/* 상단: 광고 전체 요약 (비교기간 대비 증감) */}
          <div className="kpi-grid">
            <KpiDelta label="총 광고비" value={s ? won(s.ad_cost) : "—"} delta={d.ad_cost} />
            <KpiDelta label="광고 매출" value={s ? won(s.ad_sales) : "—"} delta={d.ad_sales} />
            <KpiDelta label="ROAS" value={s?.roas != null ? `${s.roas}x` : "—"} delta={d.roas} />
            <KpiDelta label="노출량" value={s ? num(s.impressions) : "—"} delta={d.impressions} />
            <KpiDelta label="클릭수" value={s ? num(s.clicks) : "—"} delta={d.clicks} />
            <KpiDelta label="전환율" value={s?.cvr != null ? `${s.cvr}%` : "—"} delta={d.cvr} />
          </div>

          {/* 채널별 예산 비율표 */}
          <div className="card">
            <h2>채널별 예산 비율</h2>
            <div className="hbars">
              {channels.map((c) => (
                <div className="hbar-row wide" key={c.channel}>
                  <span className="hbar-label">{CH_LABEL[c.channel] ?? c.channel}</span>
                  <div className="hbar-track">
                    <div className="hbar-fill" style={{ width: `${c.budget_share ?? 0}%` }} />
                  </div>
                  <span className="hbar-val">{c.budget_share ?? 0}% · {won(c.ad_cost)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 하단: 채널 개별 상세 (비교기간 대비 증감 + 30일 추이 상시) */}
          <h2 className="section-title">채널별 상세 · 흐름</h2>
          {channels.map((c) => (
            <ChannelDetail key={c.channel} c={c} cmp={cmpMap.get(c.channel)} trend={chTrend[c.channel] ?? []} />
          ))}
        </>
      )}
    </>
  );
}

function ChannelDetail({
  c,
  cmp,
  trend,
}: {
  c: AdsChannel;
  cmp: AdsChannel | undefined;
  trend: AdsTrendRow[];
}) {
  const metrics: [string, string, number | null, number | null | undefined][] = [
    ["광고비", won(c.ad_cost), c.ad_cost, cmp?.ad_cost],
    ["광고매출", won(c.ad_sales), c.ad_sales, cmp?.ad_sales],
    ["ROAS", c.roas != null ? `${c.roas}x` : "—", c.roas, cmp?.roas],
    ["노출량", num(c.impressions), c.impressions, cmp?.impressions],
    ["클릭수", num(c.clicks), c.clicks, cmp?.clicks],
    ["전환율", c.cvr != null ? `${c.cvr}%` : "—", c.cvr, cmp?.cvr],
  ];
  return (
    <div className="card ch-detail">
      <div className="ch-head">
        <h2>{CH_LABEL[c.channel] ?? c.channel}</h2>
        <span className="badge">예산 {c.budget_share ?? 0}%</span>
      </div>
      <div className="ch-metrics six">
        {metrics.map(([k, v, cur, prev]) => {
          const dd = formatDelta(pct(cur, prev));
          return (
            <div key={k}>
              <span>{k}</span>
              <b>{v}</b>
              <em className={`mini-delta ${dd.cls}`}>{dd.text}</em>
            </div>
          );
        })}
      </div>
      <AdsTrendChart rows={trend} title="최근 30일 광고비 · ROAS 흐름" height={180} />
    </div>
  );
}
