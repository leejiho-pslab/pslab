import { useEffect, useState } from "react";
import { api } from "../api";
import { formatValue } from "../format";
import { computeRanges, type Preset, type Ranges } from "../periods";
import type { AdsChannel, AdsOverview } from "../types";
import { PeriodSelector } from "../components/PeriodSelector";
import { KpiDelta } from "../components/KpiDelta";

const CH_LABEL: Record<string, string> = {
  meta: "Meta", google: "Google", naver: "Naver", kakao: "Kakao",
};
const won = (v: number) => formatValue(v, "currency");
const num = (v: number) => Math.round(v).toLocaleString("ko-KR");

export function AdsPage({ date }: { date: string }) {
  const [ranges, setRanges] = useState<Ranges>(() => computeRanges(date, "week"));
  const [data, setData] = useState<AdsOverview | null>(null);

  useEffect(() => setRanges(computeRanges(date, "week")), [date]);
  useEffect(() => {
    api.adsOverview(ranges).then(setData);
  }, [ranges]);

  const onChange = (r: Ranges, _p: Preset) => setRanges(r);
  const s = data?.selected.summary;
  const d = data?.deltas ?? {};
  const channels = data?.selected.channels ?? [];

  return (
    <>
      <PeriodSelector base={date} ranges={ranges} onChange={onChange} />

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

      {/* 하단: 채널 개별 현황 */}
      <h2 className="section-title">채널별 데일리 현황</h2>
      <div className="ch-grid">
        {channels.map((c) => (
          <ChannelCard key={c.channel} c={c} />
        ))}
      </div>
    </>
  );
}

function ChannelCard({ c }: { c: AdsChannel }) {
  const rows: [string, string][] = [
    ["광고비", won(c.ad_cost)],
    ["광고매출", won(c.ad_sales)],
    ["ROAS", c.roas != null ? `${c.roas}x` : "—"],
    ["노출량", num(c.impressions)],
    ["클릭수", num(c.clicks)],
    ["전환율", c.cvr != null ? `${c.cvr}%` : "—"],
    ["CTR", c.ctr != null ? `${c.ctr}%` : "—"],
    ["CPA", c.cpa != null ? won(c.cpa) : "—"],
  ];
  return (
    <div className="card ch-card">
      <div className="ch-head">
        <h2>{CH_LABEL[c.channel] ?? c.channel}</h2>
        <span className="badge">예산 {c.budget_share ?? 0}%</span>
      </div>
      <div className="ch-metrics">
        {rows.map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
