import { useEffect, useState } from "react";
import { api } from "../api";
import { formatValue } from "../format";
import { daysBefore } from "../util";
import type {
  Creative,
  CreativeFatigue,
  CreativeOverview,
  KeywordReportResponse,
  KeywordRow,
} from "../types";
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
const num = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("ko-KR"));

// 광고 히스토리 상단 채널 탭 — Meta(소재) / 네이버 검색(키워드) / 네이버 플레이스(광고그룹)
type HistCh = "meta" | "naver_powerlink" | "naver_place";
const HIST_TABS: { key: HistCh; label: string }[] = [
  { key: "meta", label: "Meta 소재" },
  { key: "naver_powerlink", label: "네이버 검색(키워드)" },
  { key: "naver_place", label: "네이버 플레이스" },
];

export function CreativePage({ date }: { date: string }) {
  const [from, setFrom] = useState(() => daysBefore(date, 6));
  const [to, setTo] = useState(date);
  const [hist, setHist] = useState<HistCh>("meta");

  useEffect(() => {
    setFrom(daysBefore(date, 6));
    setTo(date);
  }, [date]);

  return (
    <>
      <RangePicker base={date} from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />

      <div className="card-head" style={{ marginBottom: 12 }}>
        <div className="filter-group">
          채널:
          {HIST_TABS.map((t) => (
            <button key={t.key} className={hist === t.key ? "active" : ""} onClick={() => setHist(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {hist === "meta" ? (
        <MetaCreatives from={from} to={to} />
      ) : (
        <KeywordReport from={from} to={to} channel={hist} />
      )}
    </>
  );
}

// ── Meta 소재 히스토리 ───────────────────────────────────────────
function MetaCreatives({ from, to }: { from: string; to: string }) {
  const [sort, setSort] = useState<"conversions" | "ctr" | "cvr">("conversions");
  const [data, setData] = useState<CreativeOverview | null>(null);
  const [fatigue, setFatigue] = useState<CreativeFatigue[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    setData(null);
    setErr("");
    api.creativesOverview(from, to, sort).then(setData).catch((e) => setErr(String(e)));
    api.creativesFatigue(to).then((r) => setFatigue(r.items)).catch(() => {});
  }, [from, to, sort]);

  if (err) return <ErrorState error={err} />;
  if (!data) return <Loading rows={3} />;

  const s = data.summary;
  const creatives = (data.creatives ?? []).filter((c) => c.channel === "meta");
  const fatiguedIds = new Set(fatigue.filter((f) => f.fatigued).map((f) => f.creative_id));

  return (
    <>
      <div className="kpi-grid">
        <Kpi label="라이브 소재" value={`${creatives.length}개`} />
        <Kpi label="광고비" value={won(s.ad_cost)} />
        <Kpi label="총 전환(결과)" value={num(s.conversions)} />
        <Kpi label="전환당 비용" value={s.conversions ? won(Math.round(s.ad_cost / s.conversions)) : "—"} />
        <Kpi label="평균 CTR" value={s.ctr != null ? `${s.ctr}%` : "—"} />
        <Kpi label="전환율" value={s.cvr != null ? `${s.cvr}%` : "—"} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>소재별 성과 ({creatives.length})</h2>
          <span className="filter-group">
            정렬:
            {(["conversions", "ctr", "cvr"] as const).map((x) => (
              <button key={x} className={sort === x ? "active" : ""} onClick={() => setSort(x)}>
                {x === "conversions" ? "전환(결과)" : x.toUpperCase()}
              </button>
            ))}
          </span>
        </div>

        {creatives.length === 0 ? (
          <p className="muted">기간 내 Meta 소재 데이터가 없습니다. (Meta 연동/수집 후 표시)</p>
        ) : (
          <div className="ad-grid">
            {creatives.map((c) => (
              <AdCard key={c.creative_id} c={c} fatigued={fatiguedIds.has(c.creative_id)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── 네이버 검색/플레이스 키워드 리포트 ───────────────────────────
function KeywordReport({ from, to, channel }: { from: string; to: string; channel: string }) {
  const [data, setData] = useState<KeywordReportResponse | null>(null);
  const [sort, setSort] = useState<"ad_cost" | "clicks" | "impressions" | "conversions">("ad_cost");
  const [err, setErr] = useState("");

  useEffect(() => {
    setData(null);
    setErr("");
    api.adsKeywords(from, to, channel, sort).then(setData).catch((e) => setErr(String(e)));
  }, [from, to, channel, sort]);

  if (err) return <ErrorState error={err} />;
  if (!data) return <Loading rows={3} />;

  const s = data.summary;
  const rows = data.rows ?? [];
  const isPlace = channel === "naver_place";
  const label = CH_LABEL[channel] ?? channel;

  return (
    <>
      <div className="kpi-grid">
        <Kpi label={isPlace ? "광고그룹 수" : "키워드 수"} value={`${s.keyword_count}개`} />
        <Kpi label="광고비 소진" value={won(s.ad_cost)} />
        <Kpi label="노출수" value={num(s.impressions)} />
        <Kpi label="클릭수" value={num(s.clicks)} />
        <Kpi label="평균 CTR" value={s.ctr != null ? `${s.ctr}%` : "—"} />
        <Kpi label="평균 CPC" value={won(s.cpc)} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>{label} · {isPlace ? "광고그룹" : "키워드"} 리포트 ({rows.length})</h2>
          <span className="filter-group">
            정렬:
            {(["ad_cost", "clicks", "impressions", "conversions"] as const).map((x) => (
              <button key={x} className={sort === x ? "active" : ""} onClick={() => setSort(x)}>
                {x === "ad_cost" ? "광고비" : x === "clicks" ? "클릭" : x === "impressions" ? "노출" : "전환"}
              </button>
            ))}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="muted">
            기간 내 {label} 데이터가 없습니다. 네이버 검색광고(SA) 연동·수집 후 표시됩니다.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="left">{isPlace ? "광고그룹" : "키워드"}</th>
                  <th className="left">캠페인</th>
                  <th>광고비 소진</th>
                  <th>노출</th>
                  <th>클릭</th>
                  <th>CTR</th>
                  <th>CPC</th>
                  <th>전환</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <KeywordRowView key={`${r.campaign}:${r.adgroup}:${r.keyword}:${i}`} r={r} isPlace={isPlace} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function KeywordRowView({ r, isPlace }: { r: KeywordRow; isPlace: boolean }) {
  const first = isPlace ? r.adgroup : r.keyword && r.keyword !== "-" ? r.keyword : r.adgroup;
  return (
    <tr>
      <td className="left strong">{first}</td>
      <td className="left muted">{r.campaign}</td>
      <td className="strong">{won(r.ad_cost)}</td>
      <td>{num(r.impressions)}</td>
      <td>{num(r.clicks)}</td>
      <td>{r.ctr != null ? `${r.ctr}%` : "—"}</td>
      <td>{won(r.cpc)}</td>
      <td>{num(r.conversions)}</td>
    </tr>
  );
}

function AdCard({ c, fatigued }: { c: Creative; fatigued: boolean }) {
  const rows: [string, string][] = [
    ["전환(결과)", c.conversions != null ? num(c.conversions) : "—"],
    ["전환율", c.cvr != null ? `${c.cvr}%` : "—"],
    ["전환당 비용", c.conversions ? won(Math.round(c.ad_cost / c.conversions)) : "—"],
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
              <td className={k === "전환(결과)" ? "hot" : ""}>{v}</td>
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
