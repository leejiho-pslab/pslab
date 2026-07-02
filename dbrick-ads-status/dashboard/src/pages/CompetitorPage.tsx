import { useEffect, useState } from "react";
import { api } from "../api";
import { daysBefore } from "../util";
import type {
  BestChange,
  Competitor,
  CompetitorCreatives,
  NaverSearchItem,
  NaverTrend,
} from "../types";
import { RangePicker } from "../components/RangePicker";
import { CategoryBar } from "../components/CategoryBar";
import { MultiLineChart } from "../components/MultiLineChart";
import { Loading, ErrorState } from "../components/States";

const PLAT_LABEL: Record<string, string> = { meta: "Meta", google: "Google" };

export function CompetitorPage({ date }: { date: string }) {
  const [from, setFrom] = useState(() => daysBefore(date, 6));
  const [to, setTo] = useState(date);
  const [comps, setComps] = useState<Competitor[]>([]);
  const [search, setSearch] = useState<NaverSearchItem[]>([]);
  const [trend, setTrend] = useState<NaverTrend>({ competitors: [], rows: [] });
  const [ads, setAds] = useState<CompetitorCreatives[]>([]);
  const [changes, setChanges] = useState<BestChange[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setFrom(daysBefore(date, 6));
    setTo(date);
  }, [date]);
  useEffect(() => {
    Promise.all([
      api.competitors(to),
      api.competitorsNaver(from, to),
      api.competitorsCreatives(to),
      api.competitorsBestChanges(to),
    ])
      .then(([c, nv, cr, bc]) => {
        setComps(c.competitors);
        setSearch(nv.search);
        setTrend(nv.trend);
        setAds(cr.competitors);
        setChanges(bc.items);
        setLoaded(true);
      })
      .catch((e) => setErr(String(e)));
  }, [from, to]);

  return (
    <>
      <RangePicker base={date} from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      {err ? (
        <ErrorState error={err} />
      ) : !loaded ? (
        <Loading rows={3} />
      ) : (
        <>
          {/* 경쟁사 개요 카드 */}
          <div className="comp-grid">
            {comps.map((c) => (
              <div className="card comp-card" key={c.name}>
                <div className="comp-head">
                  <h2>{c.name}</h2>
                  <span className="rating">★ {c.avg_rating ?? "—"}</span>
                </div>
                <div className="comp-stats">
                  <div><span>프로모션</span><b>{c.active_promotions ?? 0}</b></div>
                  <div><span>노출 광고</span><b>{c.ad_count ?? 0}</b></div>
                  <div><span>신규 후기</span><b>{c.new_reviews ?? 0}</b></div>
                </div>
                <div className="comp-best">
                  <span className="muted">베스트 상품</span>
                  <div className="chips">
                    {c.best_products.map((p, i) => (
                      <span className="chip" key={p}>{i + 1}. {p}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 네이버 검색량 + 트렌드 */}
          <div className="two-col">
            <CategoryBar
              title="네이버 검색량 현황"
              unit="number"
              items={search.map((s) => ({ key: s.competitor, value: s.volume }))}
            />
            <MultiLineChart title="네이버 트렌드 흐름" series={trend.competitors} rows={trend.rows} />
          </div>

          {/* 경쟁사 광고 소재 */}
          <h2 className="section-title">경쟁사 광고 소재 (메타 · 구글)</h2>
          <div className="comp-grid">
            {ads.map((c) => (
              <div className="card comp-card" key={c.name}>
                <h2>{c.name}</h2>
                <div className="ad-creatives">
                  {c.creatives.map((a, i) => (
                    <div className="ad-creative" key={i}>
                      <span className={`plat-badge ${a.platform}`}>{PLAT_LABEL[a.platform] ?? a.platform}</span>
                      <span className="ad-title">{a.title}</span>
                    </div>
                  ))}
                  {c.creatives.length === 0 && <p className="muted">노출 중인 광고 없음</p>}
                </div>
              </div>
            ))}
          </div>

          {/* 베스트 상품 카테고리 분석 */}
          <h2 className="section-title">베스트 상품 변화 분석 (전일 대비)</h2>
          <div className="comp-grid">
            {changes.map((c) => (
              <div className="card comp-card" key={c.name}>
                <h2>{c.name}</h2>
                <div className="change-block">
                  <span className="muted">🆕 신규 진입</span>
                  <div className="chips">
                    {c.new_entries.length ? (
                      c.new_entries.map((p) => <span className="chip new" key={p}>{p}</span>)
                    ) : (
                      <span className="muted small">없음</span>
                    )}
                  </div>
                </div>
                <div className="change-block">
                  <span className="muted">↕ 순위 변동</span>
                  <div className="rank-changes">
                    {c.rank_changes.length ? (
                      c.rank_changes.map((r) => (
                        <div className="rank-row" key={r.product}>
                          <span>{r.product}</span>
                          <span className={r.delta > 0 ? "delta up" : "delta down"}>
                            {r.prev_rank}위 → {r.cur_rank}위 {r.delta > 0 ? "▲" : "▼"}{Math.abs(r.delta)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="muted small">변동 없음</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
