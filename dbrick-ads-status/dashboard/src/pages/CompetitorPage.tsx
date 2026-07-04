import { useEffect, useState } from "react";
import { api } from "../api";
import { daysBefore } from "../util";
import type {
  BestChange,
  Competitor,
  CompetitorLink,
  CompetitorMediaItem,
  CompetitorMediaResponse,
  NaverSearchItem,
  NaverTrend,
} from "../types";
import { RangePicker } from "../components/RangePicker";
import { CategoryBar } from "../components/CategoryBar";
import { MultiLineChart } from "../components/MultiLineChart";
import { Loading, ErrorState } from "../components/States";

const MEDIA_PLAT: Record<string, string> = { instagram: "인스타", meta: "메타 광고", google: "구글 광고" };
const num = (v: number | null | undefined) => (v == null ? null : v.toLocaleString("ko-KR"));

// 인스타 게시물/릴스 링크 → 공개 임베드 URL(이미지+캡션 자동 표시). 아니면 null.
function instagramEmbed(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed/captioned/` : null;
}

function MediaHeader({ m }: { m: CompetitorMediaItem }) {
  const likes = num(m.likes);
  const comments = num(m.comments);
  return (
    <div className="media-meta">
      <div className="media-top">
        <span className={`plat-badge ${m.platform}`}>{MEDIA_PLAT[m.platform] ?? m.platform}</span>
        <span className="media-comp">{m.competitor}</span>
        {m.post_date && <span className="muted small">{m.post_date}</span>}
      </div>
      {(likes || comments) && (
        <div className="media-eng small muted">
          {likes && <span>♥ {likes}</span>}
          {comments && <span>💬 {comments}</span>}
        </div>
      )}
    </div>
  );
}

function MediaCard({ m }: { m: CompetitorMediaItem }) {
  const embed = m.platform === "instagram" ? instagramEmbed(m.link) : null;

  // 1) 인스타 게시물 링크 → 실제 게시물 임베드(이미지+캡션). 링크만 있으면 됨.
  if (embed) {
    return (
      <div className="card media-card">
        <MediaHeader m={m} />
        <iframe
          className="media-embed"
          src={embed}
          title={`${m.competitor} 인스타 게시물`}
          loading="lazy"
          allowTransparency
          frameBorder={0}
        />
      </div>
    );
  }

  // 2) 그 외(메타/구글 소재 등) → 붙여넣은 이미지 표시. 캡션은 아래에.
  const body = (
    <>
      {m.image_url ? (
        <img className="media-img" src={m.image_url} alt={m.caption ?? m.competitor} loading="lazy" />
      ) : (
        <div className="media-img ph">이미지 없음 — 인스타는 링크만, 메타/구글은 이미지URL 입력</div>
      )}
      <MediaHeader m={m} />
      {m.caption && <p className="media-cap" title={m.caption}>{m.caption}</p>}
    </>
  );
  return m.link ? (
    <a className="card media-card" href={m.link} target="_blank" rel="noreferrer">{body}</a>
  ) : (
    <div className="card media-card">{body}</div>
  );
}

// 경쟁사 소재·포스팅은 상단 기간과 무관하게 항상 "최근 10일" 고정으로 끌어온다.
const MEDIA_DAYS = 10;

export function CompetitorPage({ date }: { date: string }) {
  const [from, setFrom] = useState(() => daysBefore(date, 6));
  const [to, setTo] = useState(date);
  // 최근 10일은 "실제 오늘"에 맞춘다(수집 기준일이 하루 뒤처져도 오늘 게시분이 보이도록).
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD (로컬/KST)
  const mediaTo = today >= date ? today : date;
  const mediaFrom = daysBefore(mediaTo, MEDIA_DAYS - 1);
  const [comps, setComps] = useState<Competitor[]>([]);
  const [search, setSearch] = useState<NaverSearchItem[]>([]);
  const [trend, setTrend] = useState<NaverTrend>({ competitors: [], rows: [] });
  const [changes, setChanges] = useState<BestChange[]>([]);
  const [directory, setDirectory] = useState<CompetitorLink[]>([]);
  const [media, setMedia] = useState<CompetitorMediaResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setFrom(daysBefore(date, 6));
    setTo(date);
  }, [date]);
  // 지정 현황(딥링크)은 기간과 무관 — 빠르게 상단에 표시
  useEffect(() => {
    api.competitorsDirectory().then((d) => setDirectory(d.competitors)).catch(() => {});
  }, []);
  // 소재·포스팅은 최근 10일 고정(상단 기간 선택과 별개)
  useEffect(() => {
    api.competitorsMedia(mediaFrom, mediaTo).then(setMedia).catch(() => setMedia(null));
  }, [date]);
  useEffect(() => {
    Promise.all([
      api.competitors(to),
      api.competitorsNaver(from, to),
      api.competitorsBestChanges(to),
    ])
      .then(([c, nv, bc]) => {
        setComps(c.competitors);
        setSearch(nv.search);
        setTrend(nv.trend);
        setChanges(bc.items);
        setLoaded(true);
      })
      .catch((e) => setErr(String(e)));
  }, [from, to]);

  return (
    <>
      <RangePicker base={date} from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />

      {/* 경쟁사 지정 현황 — 홈페이지/인스타/광고라이브러리 원클릭 (기간 무관, 항상 상단) */}
      {directory.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>경쟁사 지정 현황 ({directory.length}곳)</h2>
            <span className="muted small">디브릭 경쟁사로 지정된 업체 · 바로가기</span>
          </div>
          <div className="comp-dir-grid">
            {directory.map((c) => (
              <div className="comp-dir" key={c.name}>
                <div className="comp-dir-name">{c.name}</div>
                <div className="comp-dir-links">
                  {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="linkbtn home">홈페이지</a>}
                  {c.insta_url && <a href={c.insta_url} target="_blank" rel="noreferrer" className="linkbtn insta">인스타그램</a>}
                  {c.fb_ad_library_url && <a href={c.fb_ad_library_url} target="_blank" rel="noreferrer" className="linkbtn meta">메타 광고(라이브)</a>}
                  {c.google_ads_url && <a href={c.google_ads_url} target="_blank" rel="noreferrer" className="linkbtn google">구글 광고</a>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

          {/* 경쟁사 인스타 포스팅 · 광고 소재 이미지 (선택 기간 게시분, 구글시트 연동) */}
          {media?.configured && (
            <>
              <h2 className="section-title">경쟁사 소재 · 포스팅 (최근 {MEDIA_DAYS}일 · {mediaFrom} ~ {mediaTo})</h2>
              {media.error ? (
                <div className="card"><p className="muted">시트 조회 오류: {media.error}</p></div>
              ) : media.items.length === 0 ? (
                <div className="card">
                  <p className="muted">
                    최근 {MEDIA_DAYS}일({mediaFrom}~{mediaTo})에 게시된 소재가 없습니다. 구글시트에 한 줄 추가하세요 —
                    <b> 인스타는 ‘링크’ 칸에 게시물 주소만</b> 넣으면 실제 게시물(이미지·캡션)이 자동으로 뜹니다.
                    메타/구글 소재는 <b>이미지URL</b>에 소재 이미지 주소를 넣으세요. (게시일은 이 범위 안)
                  </p>
                </div>
              ) : (
                <div className="media-grid">
                  {media.items.map((m, i) => (
                    <MediaCard key={`${m.competitor}:${m.link ?? i}`} m={m} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* 네이버 검색량 + 트렌드 */}
          <div className="two-col">
            <CategoryBar
              title="네이버 검색량 현황"
              unit="number"
              items={search.map((s) => ({ key: s.competitor, value: s.volume }))}
            />
            <MultiLineChart title="네이버 트렌드 흐름" series={trend.competitors} rows={trend.rows} />
          </div>

          {/* 메타·구글 광고 소재 모니터링 안내 (라이브는 딥링크, 특정 소재 고정은 시트) */}
          <h2 className="section-title">메타 · 구글 광고 소재 모니터링</h2>
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              현재 <b>라이브 중인 광고 소재 전체</b>는 상단 <b>경쟁사 지정 현황</b>의
              <span className="pill meta">메타 광고(라이브)</span>·<span className="pill google">구글 광고</span> 버튼으로
              바로 확인하세요(항상 최신·이미지 포함). 특정 소재를 이 화면에 고정하려면, 구글시트에
              <b> 플랫폼=meta 또는 google</b>, <b>이미지URL</b>(소재 캡처 이미지 주소)로 한 줄 추가하면
              위 <b>‘경쟁사 소재·포스팅’</b> 카드에 함께 표시됩니다.
            </p>
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
