import { useEffect, useState } from "react";
import { api } from "../api";
import { formatValue } from "../format";
import { daysBefore } from "../util";
import type { Creative, CreativeFatigue, CreativeOverview } from "../types";
import { RangePicker } from "../components/RangePicker";
import { CreativeThumb } from "../components/CreativeThumb";
import { Loading, ErrorState } from "../components/States";

const CH_LABEL: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  naver: "Naver",
  naver_powerlink: "네이버 파워링크",
  naver_place: "네이버 플레이스",
  naver_other: "네이버 기타",
  kakao: "Kakao",
};
const won = (v: number | null | undefined) => (v == null ? "—" : formatValue(v, "currency"));
const num = (v: number) => Math.round(v).toLocaleString("ko-KR");
const roasPct = (r: number | null | undefined) => (r == null ? "—" : `${Math.round(r * 100)}%`);

export function CreativePage({ date }: { date: string }) {
  const [from, setFrom] = useState(() => daysBefore(date, 6));
  const [to, setTo] = useState(date);
  const [sort, setSort] = useState<"roas" | "ctr" | "cvr" | "ad_sales">("roas");
  const [channel, setChannel] = useState<string>("all");
  const [data, setData] = useState<CreativeOverview | null>(null);
  const [fatigue, setFatigue] = useState<CreativeFatigue[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    setFrom(daysBefore(date, 6));
    setTo(date);
  }, [date]);
  useEffect(() => {
    setData(null);
    api.creativesOverview(from, to, sort).then(setData).catch((e) => setErr(String(e)));
    api.creativesFatigue(to).then((r) => setFatigue(r.items)).catch(() => {});
  }, [from, to, sort]);

  const s = data?.summary;
  const all = data?.creatives ?? [];
  const channels = Array.from(new Set(all.map((c) => c.channel)));
  const creatives = channel === "all" ? all : all.filter((c) => c.channel === channel);
  const fatiguedIds = new Set(fatigue.filter((f) => f.fatigued).map((f) => f.creative_id));

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
            <Kpi label="광고비" value={s ? won(s.ad_cost) : "—"} />
            <Kpi label="구매 전환값" value={s ? won(s.ad_sales) : "—"} />
            <Kpi label="평균 ROAS" value={roasPct(s?.roas)} />
            <Kpi label="평균 CTR" value={s?.ctr != null ? `${s.ctr}%` : "—"} />
            <Kpi label="총 구매" value={s ? num(s.conversions) : "—"} />
          </div>

          <div className="card">
            <div className="card-head">
              <h2>소재별 성과 ({creatives.length})</h2>
              <div className="sort-tabs">
                {channels.length > 1 && (
                  <span className="filter-group">
                    채널:
                    <button className={channel === "all" ? "active" : ""} onClick={() => setChannel("all")}>전체</button>
                    {channels.map((ch) => (
                      <button key={ch} className={channel === ch ? "active" : ""} onClick={() => setChannel(ch)}>
                        {CH_LABEL[ch] ?? ch}
                      </button>
                    ))}
                  </span>
                )}
                <span className="filter-group">
                  정렬:
                  {(["roas", "ad_sales", "ctr", "cvr"] as const).map((x) => (
                    <button key={x} className={sort === x ? "active" : ""} onClick={() => setSort(x)}>
                      {x === "ad_sales" ? "구매전환값" : x.toUpperCase()}
                    </button>
                  ))}
                </span>
              </div>
            </div>

            {creatives.length === 0 ? (
              <p className="muted">기간 내 소재 데이터가 없습니다. (Meta 연동/수집 후 표시)</p>
            ) : (
              <div className="ad-grid">
                {creatives.map((c) => (
                  <AdCard key={c.creative_id} c={c} fatigued={fatiguedIds.has(c.creative_id)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function AdCard({ c, fatigued }: { c: Creative; fatigued: boolean }) {
  const rows: [string, string][] = [
    ["구매", c.conversions != null ? num(c.conversions) : "—"],
    ["ROAS", roasPct(c.roas)],
    ["구매 전환값", won(c.ad_sales)],
    ["CTR", c.ctr != null ? `${c.ctr}%` : "—"],
    ["CPC", won(c.cpc)],
    ["비용", won(c.ad_cost)],
  ];
  return (
    <div className="ad-card">
      <CreativeThumb id={c.creative_id} name={c.name} src={c.thumb} ratio />
      <div className="ad-card-head">
        <span className="ad-name" title={c.name}>{c.name}</span>
        <span className="ad-ch">{CH_LABEL[c.channel] ?? c.channel}{fatigued ? " · ▼피로" : ""}</span>
      </div>
      <table className="ad-metrics">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td className={k === "ROAS" ? "hot" : ""}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
