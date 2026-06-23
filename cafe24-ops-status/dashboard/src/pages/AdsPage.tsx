import { useEffect, useState } from "react";
import { api } from "../api";
import { daysBefore } from "../util";
import { formatValue } from "../format";
import type { AdsChannel, AdsSummary, AdsTrendRow } from "../types";
import { AdsTrendChart } from "../components/AdsTrendChart";
import { CategoryBar } from "../components/CategoryBar";

const CH_LABEL: Record<string, string> = {
  meta: "Meta", google: "Google", naver: "Naver", kakao: "Kakao",
};

export function AdsPage({ date }: { date: string }) {
  const [summary, setSummary] = useState<AdsSummary | null>(null);
  const [channels, setChannels] = useState<AdsChannel[]>([]);
  const [trend, setTrend] = useState<AdsTrendRow[]>([]);

  useEffect(() => {
    if (!date) return;
    const from = daysBefore(date, 13);
    Promise.all([api.adsSummary(date), api.adsChannels(date), api.adsTrend(from, date)]).then(
      ([s, ch, tr]) => {
        setSummary(s);
        setChannels(ch.channels);
        setTrend(tr.rows);
      },
    );
  }, [date]);

  return (
    <>
      <div className="kpi-grid kpi-4">
        <Kpi label="총 광고비" value={summary ? formatValue(summary.ad_cost, "currency") : "—"} />
        <Kpi label="광고 매출" value={summary ? formatValue(summary.ad_sales, "currency") : "—"} />
        <Kpi label="ROAS" value={summary?.roas != null ? `${summary.roas}x` : "—"} />
        <Kpi
          label="광고매출 비중"
          value={summary?.ad_share != null ? `${summary.ad_share}%` : "—"}
        />
      </div>

      <div className="card">
        <h2>채널별 성과</h2>
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th className="left">채널</th>
                <th>광고비</th>
                <th>광고매출</th>
                <th>ROAS</th>
                <th>CTR</th>
                <th>CPC</th>
                <th>CPA</th>
                <th>전환수</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.channel}>
                  <td className="left strong">{CH_LABEL[c.channel] ?? c.channel}</td>
                  <td>{formatValue(c.ad_cost, "currency")}</td>
                  <td>{formatValue(c.ad_sales, "currency")}</td>
                  <td className="strong">{c.roas != null ? `${c.roas}x` : "—"}</td>
                  <td>{c.ctr != null ? `${c.ctr}%` : "—"}</td>
                  <td>{c.cpc != null ? formatValue(c.cpc, "currency") : "—"}</td>
                  <td>{c.cpa != null ? formatValue(c.cpa, "currency") : "—"}</td>
                  <td>{Math.round(c.conversions).toLocaleString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="two-col">
        <CategoryBar
          title="채널별 ROAS"
          unit="roas"
          items={channels.map((c) => ({ key: CH_LABEL[c.channel] ?? c.channel, value: c.roas ?? 0 }))}
        />
        <CategoryBar
          title="채널별 광고비"
          items={channels.map((c) => ({ key: CH_LABEL[c.channel] ?? c.channel, value: c.ad_cost }))}
        />
      </div>

      <AdsTrendChart rows={trend} />
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}
