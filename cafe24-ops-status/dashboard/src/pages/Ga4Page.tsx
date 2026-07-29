import { useEffect, useState } from "react";
import { api } from "../api";
import { formatDelta } from "../format";
import { computeRanges, type Preset, type Ranges } from "../periods";
import type {
  Ga4ChannelsResponse,
  Ga4EntryPath,
  Ga4ExitPage,
  Ga4Funnel,
  Ga4FunnelChannel,
  Ga4JourneyResponse,
  Ga4PageRow,
  Ga4SiteResponse,
} from "../types";
import { PeriodSelector } from "../components/PeriodSelector";
import { KpiDelta } from "../components/KpiDelta";
import { MultiLineChart } from "../components/MultiLineChart";
import { Loading, EmptyState, ErrorState } from "../components/States";

const num = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(v).toLocaleString("ko-KR");
const pctv = (v: number | null | undefined, digits = 1) =>
  v == null ? "—" : `${v.toFixed(digits)}%`;
const dur = (sec: number | null | undefined) => {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  return m ? `${m}분 ${Math.round(sec % 60)}초` : `${Math.round(sec)}초`;
};
// %p 변화 — 이탈률처럼 이미 %인 지표는 비율(%)이 아니라 포인트 차이로 본다.
const deltaP = (v: number | null) => {
  if (v == null) return { text: "—", cls: "flat" };
  if (v > 0) return { text: `▲ ${v.toFixed(1)}%p`, cls: "up" };
  if (v < 0) return { text: `▼ ${Math.abs(v).toFixed(1)}%p`, cls: "down" };
  return { text: "0.0%p", cls: "flat" };
};

export function Ga4Page({ date }: { date: string }) {
  const [ranges, setRanges] = useState<Ranges>(() => computeRanges(date, "week"));
  const [site, setSite] = useState<Ga4SiteResponse | null>(null);
  const [channels, setChannels] = useState<Ga4ChannelsResponse | null>(null);
  const [pages, setPages] = useState<Ga4PageRow[]>([]);
  const [journey, setJourney] = useState<Ga4JourneyResponse | null>(null);
  const [funnelCh, setFunnelCh] = useState<string>("");   // "" = 전체
  const [err, setErr] = useState("");

  useEffect(() => setRanges(computeRanges(date, "week")), [date]);
  useEffect(() => {
    const { selFrom, selTo } = ranges;
    Promise.all([
      api.ga4Site(selFrom, selTo),
      api.ga4Channels(ranges),
      api.ga4Pages(selFrom, selTo, 10),
    ])
      .then(([s, c, p]) => {
        setSite(s);
        setChannels(c);
        setPages(p.rows);
      })
      .catch((e) => setErr(String(e)));
  }, [ranges]);
  // 퍼널은 채널 필터가 바뀔 때만 다시 부르면 되므로 분리
  useEffect(() => {
    api.ga4Journey(ranges, funnelCh || undefined).then(setJourney).catch((e) => setErr(String(e)));
  }, [ranges, funnelCh]);

  const s = site?.summary;
  const hasData = !!s && s.days > 0;

  return (
    <>
      <PeriodSelector base={date} ranges={ranges} onChange={(r: Ranges, _p: Preset) => setRanges(r)} />
      {err ? (
        <ErrorState error={err} />
      ) : !site ? (
        <Loading rows={4} />
      ) : !hasData ? (
        <div className="card">
          <h2>GA4 데이터 없음</h2>
          <p className="muted">
            선택한 기간에 GA4 수집분이 없습니다. GA4_PROPERTY_ID / 서비스계정 시크릿 설정 후
            수집이 돌면 표시됩니다.
          </p>
        </div>
      ) : (
        <>
          {/* 1. 사이트 요약 */}
          <div className="kpi-grid">
            <KpiDelta label="방문자" value={num(s.visitors)} delta={null} />
            <KpiDelta label="세션" value={num(s.sessions)} delta={null} />
            <KpiDelta label="페이지뷰" value={num(s.page_views)} delta={null} />
            <KpiDelta label="세션당 페이지" value={s.pages_per_session?.toFixed(2) ?? "—"} delta={null} />
            <KpiDelta label="평균 체류시간" value={dur(s.avg_session_duration)} delta={null} />
            <KpiDelta
              label="신규 비중"
              value={s.visitors ? pctv((s.new_users / s.visitors) * 100) : "—"}
              delta={null}
            />
          </div>

          <MultiLineChart
            title="일자별 방문자 · 세션 · 페이지뷰"
            series={["visitors", "sessions", "page_views"]}
            rows={site.trend.map((r) => ({
              date: r.date,
              visitors: r.visitors ?? 0,
              sessions: r.sessions ?? 0,
              page_views: r.page_views ?? 0,
            }))}
          />

          {/* 2. 광고 유입 채널 */}
          <h2 className="section-title">① 광고 유입 채널 — 어디서 들어오나</h2>
          <ChannelSection data={channels} />

          {/* 3. 유입 경로 */}
          <h2 className="section-title">② 유입 경로 — 광고가 어느 페이지로 보내나</h2>
          <EntryPathSection rows={journey?.entry_paths ?? []} />

          {/* 4. 구매 경로 퍼널 */}
          <h2 className="section-title">③ 구매 경로 — 어느 단계에서 빠지나</h2>
          <FunnelSection
            funnel={journey?.funnel ?? null}
            channels={journey?.funnel_channels ?? []}
            selected={funnelCh}
            onSelect={setFunnelCh}
          />

          {/* 5. 이탈 페이지 */}
          <h2 className="section-title">④ 이탈 페이지 — 어디서 이탈이 늘고 있나</h2>
          <ExitSection
            rows={journey?.exit_pages ?? []}
            cmpFrom={journey?.cmp_from}
            cmpTo={journey?.cmp_to}
          />

          {/* 6. 인기 페이지 */}
          <div className="card">
            <h2>많이 본 페이지 TOP 10</h2>
            {pages.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="hbars">
                {pages.map((p) => (
                  <div className="hbar-row wide" key={p.page}>
                    <span className="hbar-label" title={p.page}>{p.page}</span>
                    <div className="hbar-track">
                      <div
                        className="hbar-fill"
                        style={{ width: `${(p.views / (pages[0]?.views || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="hbar-val">{num(p.views)}회</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ── ① 채널별 유입·전환 (비교기간 대비 증감) ─────────────────────
function ChannelSection({ data }: { data: Ga4ChannelsResponse | null }) {
  const [detail, setDetail] = useState(false);
  if (!data) return <Loading rows={1} />;
  const chs = data.channels;
  if (chs.length === 0) return <div className="card"><EmptyState /></div>;

  const total = chs.reduce((a, c) => a + c.sessions, 0) || 1;
  // 원본 source/medium 은 채널 단위로 묶어 증감을 함께 보여준다
  const smByChannel = new Map<string, typeof data.rows>();
  for (const r of data.rows) {
    const arr = smByChannel.get(r.channel) ?? [];
    arr.push(r);
    smByChannel.set(r.channel, arr);
  }

  return (
    <div className="card">
      <div className="ch-head">
        <h2>채널별 세션 · 전환</h2>
        <button className="linkish" onClick={() => setDetail((v) => !v)}>
          {detail ? "간단히 보기" : "매체 원본까지 보기"}
        </button>
      </div>
      <div className="table-wrap">
        <table className="grid-table">
          <thead>
            <tr>
              <th>채널</th>
              <th>구분</th>
              <th>세션</th>
              <th>비중</th>
              <th>사용자</th>
              <th>결제완료</th>
              <th>전환율</th>
              <th>세션 증감</th>
            </tr>
          </thead>
          <tbody>
            {chs.map((c) => {
              const sms = smByChannel.get(c.channel) ?? [];
              const cd = formatDelta(c.sessions_delta);
              const rows = [
                <tr key={c.channel}>
                  <td><b>{c.label}</b></td>
                  <td>{c.is_ad ? <span className="badge">광고</span> : <span className="muted">자연</span>}</td>
                  <td>{num(c.sessions)}</td>
                  <td>{pctv((c.sessions / total) * 100)}</td>
                  <td>{num(c.users)}</td>
                  <td>{num(c.conversions)}</td>
                  <td>{pctv(c.cvr, 2)}</td>
                  <td className={`delta ${cd.cls}`}>{cd.text}</td>
                </tr>,
              ];
              if (detail)
                for (const r of sms) {
                  const d = formatDelta(r.sessions_delta);
                  rows.push(
                    <tr key={`${c.channel}:${r.source_medium}`} className="sub-row">
                      <td className="muted">↳ {r.source_medium}</td>
                      <td />
                      <td>{num(r.sessions)}</td>
                      <td>{pctv((r.sessions / total) * 100)}</td>
                      <td>{num(r.users)}</td>
                      <td>{num(r.conversions)}</td>
                      <td>{pctv(r.cvr, 2)}</td>
                      <td className={`delta ${d.cls}`}>{d.text}</td>
                    </tr>,
                  );
                }
              return rows;
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        전환은 GA4 <b>결제완료</b> 이벤트 기준입니다(키 이벤트 전체가 아니라 실제 구매만 셈).
        증감은 비교기간 {data.cmp_from}~{data.cmp_to} 대비 세션 변화입니다.
      </p>
    </div>
  );
}

// ── ② 유입 경로 (채널 → 랜딩페이지) ────────────────────────────
function EntryPathSection({ rows }: { rows: Ga4EntryPath[] }) {
  if (rows.length === 0) return <div className="card"><EmptyState message="유입 경로 데이터가 아직 없습니다." /></div>;
  return (
    <div className="card">
      <h2>채널별 첫 착지 페이지</h2>
      <div className="entry-grid">
        {rows.map((c) => (
          <div className="entry-card" key={c.channel}>
            <div className="entry-head">
              <b>{c.label}</b>
              {c.is_ad && <span className="badge">광고</span>}
              <span className="muted">{num(c.sessions)} 세션</span>
            </div>
            {c.pages.map((p) => (
              <div className="hbar-row" key={p.page}>
                <span className="hbar-label" title={p.page}>{p.page}</span>
                <div className="hbar-track">
                  <div className="hbar-fill" style={{ width: `${p.share}%` }} />
                </div>
                <span className="hbar-val">{p.share}%</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="muted">
        광고를 눌렀을 때 처음 도착한 페이지 기준입니다. 한 사람이 A→B→C로 옮겨간 순서 자체는
        GA4 기본 API로 받을 수 없어(BigQuery 연동 필요) <b>출발점</b>과 아래 <b>단계별 이탈</b>로 봅니다.
      </p>
    </div>
  );
}

// ── ③ 구매 퍼널 ───────────────────────────────────────────────
function FunnelSection({
  funnel,
  channels,
  selected,
  onSelect,
}: {
  funnel: Ga4Funnel | null;
  channels: Ga4FunnelChannel[];
  selected: string;
  onSelect: (c: string) => void;
}) {
  if (!funnel || funnel.steps.every((s) => s.count === 0))
    return <div className="card"><EmptyState message="구매 경로 데이터가 아직 없습니다." /></div>;
  const top = funnel.steps[0]?.count || 1;

  return (
    <>
      <div className="card">
        <div className="ch-head">
          <h2>단계별 통과율{selected ? ` · ${channels.find((c) => c.channel === selected)?.label ?? selected}` : " · 전체"}</h2>
          <select value={selected} onChange={(e) => onSelect(e.target.value)}>
            <option value="">전체 채널</option>
            {channels.map((c) => (
              <option key={c.channel} value={c.channel}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="funnel">
          {funnel.steps.map((st) => {
            const isNeck = st.label === funnel.bottleneck;
            return (
              <div className={`funnel-step${isNeck ? " neck" : ""}`} key={st.event}>
                <span className="funnel-label">{st.label}</span>
                <div className="funnel-track">
                  <div className="funnel-fill" style={{ width: `${(st.count / top) * 100}%` }} />
                </div>
                <span className="funnel-val">
                  {num(st.count)}
                  {st.step_rate != null && <em> · 통과 {st.step_rate}%</em>}
                </span>
              </div>
            );
          })}
        </div>
        {funnel.bottleneck && (
          <p className="muted">
            가장 많이 빠지는 단계: <b>{funnel.bottleneck}</b> — 이 단계 직전 페이지의 버튼/가격/재고
            노출을 먼저 점검하세요.
          </p>
        )}
        <p className="muted">
          이벤트 발생 <b>건수</b>의 단계별 감소입니다(개인별 이동 추적이 아님).
        </p>
      </div>

      <div className="card">
        <h2>채널별 구매 전환 비교</h2>
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th>채널</th>
                <th>구분</th>
                <th>시작(페이지 조회)</th>
                <th>결제완료</th>
                <th>전환율</th>
                <th>병목 단계</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.channel}>
                  <td>{c.label}</td>
                  <td>{c.is_ad ? <span className="badge">광고</span> : <span className="muted">자연</span>}</td>
                  <td>{num(c.start)}</td>
                  <td>{num(c.purchases)}</td>
                  <td>{pctv(c.cvr, 3)}</td>
                  <td>{c.bottleneck ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── ④ 이탈 페이지 ─────────────────────────────────────────────
function ExitSection({
  rows,
  cmpFrom,
  cmpTo,
}: {
  rows: Ga4ExitPage[];
  cmpFrom?: string;
  cmpTo?: string;
}) {
  if (rows.length === 0)
    return <div className="card"><EmptyState message="이탈 페이지 데이터가 아직 없습니다." /></div>;
  return (
    <div className="card">
      <h2>이탈률이 오르고 있는 페이지</h2>
      <div className="table-wrap">
        <table className="grid-table">
          <thead>
            <tr>
              <th>랜딩 페이지</th>
              <th>세션</th>
              <th>이탈률</th>
              <th>이전 기간</th>
              <th>변화</th>
              <th>참여율</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = deltaP(r.bounce_delta);
              return (
                <tr key={r.page} className={(r.bounce_delta ?? 0) > 5 ? "warn-row" : ""}>
                  <td title={r.page}>{r.page}</td>
                  <td>{num(r.sessions)}</td>
                  <td><b>{pctv(r.bounce_rate)}</b></td>
                  <td>{pctv(r.prev_bounce_rate)}</td>
                  <td className={`delta ${d.cls}`}>{d.text}</td>
                  <td>{pctv(r.engagement_rate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        비교기간 {cmpFrom}~{cmpTo} 대비 이탈률 변화(%p)가 큰 순서입니다. 세션 30 미만 페이지는
        수치가 요동쳐 제외했습니다. GA4에는 UA의 <b>종료수(exits)</b> 지표가 없어 <b>이탈률</b>로 봅니다.
      </p>
    </div>
  );
}
