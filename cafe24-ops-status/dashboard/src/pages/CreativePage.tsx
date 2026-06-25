import { useEffect, useState } from "react";
import { api } from "../api";
import { formatValue } from "../format";
import { daysBefore } from "../util";
import type { Creative, CreativeFatigue, CreativeOverview } from "../types";
import { RangePicker } from "../components/RangePicker";
import { CreativeThumb } from "../components/CreativeThumb";
import { Loading, ErrorState } from "../components/States";

const CH_LABEL: Record<string, string> = {
  meta: "Meta", google: "Google", naver: "Naver", kakao: "Kakao",
};
const won = (v: number) => formatValue(v, "currency");
const num = (v: number) => Math.round(v).toLocaleString("ko-KR");

export function CreativePage({ date }: { date: string }) {
  const [from, setFrom] = useState(() => daysBefore(date, 6));
  const [to, setTo] = useState(date);
  const [sort, setSort] = useState<"roas" | "ctr" | "cvr" | "ad_sales">("roas");
  const [data, setData] = useState<CreativeOverview | null>(null);
  const [fatigue, setFatigue] = useState<CreativeFatigue[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    setFrom(daysBefore(date, 6));
    setTo(date);
  }, [date]);
  useEffect(() => {
    api.creativesOverview(from, to, sort).then(setData).catch((e) => setErr(String(e)));
    api.creativesFatigue(to).then((r) => setFatigue(r.items)).catch(() => {});
  }, [from, to, sort]);

  const s = data?.summary;
  const creatives = data?.creatives ?? [];
  const byChannel = data?.by_channel ?? [];
  const top = creatives[0];
  const fatigued = fatigue.filter((f) => f.fatigued);

  return (
    <>
      <RangePicker base={date} from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      {err ? (
        <ErrorState error={err} />
      ) : !data ? (
        <Loading rows={3} />
      ) : (
        <>
          <div className="kpi-grid">
            <Kpi label="라이브 소재" value={s ? `${s.creative_count}개` : "—"} />
            <Kpi label="총 노출" value={s ? num(s.impressions) : "—"} />
            <Kpi label="총 클릭" value={s ? num(s.clicks) : "—"} />
            <Kpi label="평균 CTR" value={s?.ctr != null ? `${s.ctr}%` : "—"} />
            <Kpi label="평균 ROAS" value={s?.roas != null ? `${s.roas}x` : "—"} />
            <Kpi label="광고 매출" value={s ? won(s.ad_sales) : "—"} />
          </div>

          {top && (
            <div className="card highlight">
              <h2>🏆 기간 내 성과 최상위 소재</h2>
              <div className="top-creative">
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <CreativeThumb id={top.creative_id} name={top.name} size={56} />
                  <div>
                    <div className="tc-name">{top.name}</div>
                    <div className="muted">{CH_LABEL[top.channel] ?? top.channel} · {top.creative_id}</div>
                  </div>
                </div>
                <div className="tc-metrics">
                  <span>ROAS <b>{top.roas}x</b></span>
                  <span>CTR <b>{top.ctr}%</b></span>
                  <span>CVR <b>{top.cvr}%</b></span>
                  <span>매출 <b>{won(top.ad_sales)}</b></span>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h2>기간 내 라이브 소재 전체 ({creatives.length})</h2>
              <div className="sort-tabs">
                정렬:
                {(["roas", "ctr", "cvr", "ad_sales"] as const).map((x) => (
                  <button key={x} className={sort === x ? "active" : ""} onClick={() => setSort(x)}>
                    {x === "ad_sales" ? "매출" : x.toUpperCase()}
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
                      <td>{num(c.impressions)}</td>
                      <td>{num(c.clicks)}</td>
                      <td>{c.ctr != null ? `${c.ctr}%` : "—"}</td>
                      <td>{c.cvr != null ? `${c.cvr}%` : "—"}</td>
                      <td className="strong">{c.roas != null ? `${c.roas}x` : "—"}</td>
                      <td>{won(c.ad_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <h2 className="section-title">채널별 운영 소재</h2>
          {byChannel.map((g) => (
            <div className="card" key={g.channel}>
              <h2>{CH_LABEL[g.channel] ?? g.channel}</h2>
              <div className="creative-grid">
                {g.creatives.map((c) => (
                  <CreativeCard key={c.creative_id} c={c} />
                ))}
              </div>
            </div>
          ))}

          {fatigued.length > 0 && (
            <div className="card">
              <h2>피로도 경고 (성과 하락 소재)</h2>
              <div className="chips">
                {fatigued.map((f) => (
                  <span className="chip chart" key={f.creative_id}>
                    {f.name} ▼ {Math.abs(f.change_pct ?? 0)}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function CreativeCard({ c }: { c: Creative }) {
  return (
    <div className="creative-card">
      <CreativeThumb id={c.creative_id} name={c.name} size={56} />
      <div className="cc-body">
        <div className="cc-name">{c.name}</div>
        <div className="cc-metrics">
          <span>ROAS <b>{c.roas ?? "—"}x</b></span>
          <span>CTR <b>{c.ctr ?? "—"}%</b></span>
          <span>매출 <b>{won(c.ad_sales)}</b></span>
        </div>
      </div>
    </div>
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
