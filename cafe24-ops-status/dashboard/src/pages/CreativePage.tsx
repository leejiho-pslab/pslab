import { useEffect, useState } from "react";
import { api } from "../api";
import { formatValue } from "../format";
import type { Creative, CreativeFatigue } from "../types";
import { CategoryBar } from "../components/CategoryBar";

const CH_LABEL: Record<string, string> = {
  meta: "Meta", google: "Google", naver: "Naver", kakao: "Kakao",
};

export function CreativePage({ date }: { date: string }) {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [fatigue, setFatigue] = useState<CreativeFatigue[]>([]);
  const [sort, setSort] = useState<"roas" | "ctr" | "cvr" | "ad_sales">("roas");

  useEffect(() => {
    if (!date) return;
    api.creatives(date, 10, sort).then((r) => setCreatives(r.creatives));
    api.creativesFatigue(date).then((r) => setFatigue(r.items));
  }, [date, sort]);

  const top = creatives[0];
  const fatigued = fatigue.filter((f) => f.fatigued);

  return (
    <>
      {top && (
        <div className="card highlight">
          <h2>🏆 성과 최상위 소재</h2>
          <div className="top-creative">
            <div>
              <div className="tc-name">{top.name}</div>
              <div className="muted">{CH_LABEL[top.channel] ?? top.channel} · {top.creative_id}</div>
            </div>
            <div className="tc-metrics">
              <span>ROAS <b>{top.roas}x</b></span>
              <span>CTR <b>{top.ctr}%</b></span>
              <span>CVR <b>{top.cvr}%</b></span>
              <span>매출 <b>{formatValue(top.ad_sales, "currency")}</b></span>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>소재별 성과 (TOP 10)</h2>
          <div className="sort-tabs">
            정렬:
            {(["roas", "ctr", "cvr", "ad_sales"] as const).map((s) => (
              <button
                key={s}
                className={sort === s ? "active" : ""}
                onClick={() => setSort(s)}
              >
                {s === "ad_sales" ? "매출" : s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th className="left">순위</th>
                <th className="left">소재</th>
                <th className="left">채널</th>
                <th>노출</th>
                <th>클릭</th>
                <th>CTR</th>
                <th>CVR</th>
                <th>ROAS</th>
                <th>매출</th>
              </tr>
            </thead>
            <tbody>
              {creatives.map((c, i) => (
                <tr key={c.creative_id}>
                  <td className="left strong">{i + 1}</td>
                  <td className="left">{c.name}</td>
                  <td className="left">{CH_LABEL[c.channel] ?? c.channel}</td>
                  <td>{Math.round(c.impressions).toLocaleString("ko-KR")}</td>
                  <td>{Math.round(c.clicks).toLocaleString("ko-KR")}</td>
                  <td>{c.ctr != null ? `${c.ctr}%` : "—"}</td>
                  <td>{c.cvr != null ? `${c.cvr}%` : "—"}</td>
                  <td className="strong">{c.roas != null ? `${c.roas}x` : "—"}</td>
                  <td>{formatValue(c.ad_sales, "currency")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="two-col">
        <CategoryBar
          title="소재별 ROAS"
          unit="roas"
          items={creatives.map((c) => ({ key: c.name, value: c.roas ?? 0 }))}
        />
        <div className="card">
          <h2>피로도 경고 (성과 하락 소재)</h2>
          {fatigued.length === 0 ? (
            <p className="muted">최근 성과가 크게 하락한 소재가 없습니다.</p>
          ) : (
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="left">소재</th>
                  <th>최근 ROAS</th>
                  <th>직전 ROAS</th>
                  <th>변화</th>
                </tr>
              </thead>
              <tbody>
                {fatigued.map((f) => (
                  <tr key={f.creative_id}>
                    <td className="left">{f.name}</td>
                    <td>{f.recent_roas != null ? `${f.recent_roas}x` : "—"}</td>
                    <td>{f.prior_roas != null ? `${f.prior_roas}x` : "—"}</td>
                    <td className="delta down">▼ {Math.abs(f.change_pct ?? 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
