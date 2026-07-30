import { useEffect, useState } from "react";
import { api } from "../api";
import { formatValue, formatDelta } from "../format";
import { computeRanges, type Preset, type Ranges } from "../periods";
import type { ShopAnalytics, ShopFunnelRow, ShopRankedRow } from "../types";
import { PeriodSelector } from "../components/PeriodSelector";
import { KpiDelta } from "../components/KpiDelta";
import { MultiLineChart } from "../components/MultiLineChart";
import { Loading, EmptyState, ErrorState } from "../components/States";

const num = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(v).toLocaleString("ko-KR");
const won = (v: number | null | undefined) => (v == null ? "—" : formatValue(v, "currency"));
const pct = (v: number | null | undefined, digits = 1) =>
  v == null ? "—" : `${v.toFixed(digits)}%`;

export function ShopAnalyticsPage({ date }: { date: string }) {
  const [ranges, setRanges] = useState<Ranges>(() => computeRanges(date, "week"));
  const [data, setData] = useState<ShopAnalytics | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => setRanges(computeRanges(date, "week")), [date]);
  useEffect(() => {
    api.shopAnalytics(ranges).then(setData).catch((e) => setErr(String(e)));
  }, [ranges]);

  const s = data?.summary;
  const hasData = !!s && s.days > 0;

  return (
    <>
      <PeriodSelector base={date} ranges={ranges} onChange={(r: Ranges, _p: Preset) => setRanges(r)} />
      {err ? (
        <ErrorState error={err} />
      ) : !data ? (
        <Loading rows={4} />
      ) : !hasData ? (
        <div className="card">
          <h2>카페24 접속통계 데이터 없음</h2>
          <p className="muted">
            선택한 기간에 수집분이 없습니다. 카페24 토큰에 <b>mall.read_analytics</b> 권한이
            있어야 하고, 수집이 한 번 돌아야 표시됩니다.
          </p>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <KpiDelta label="방문" value={num(s.visits)} delta={null} />
            <KpiDelta label="신규 방문" value={num(s.first_visits)} delta={null} />
            <KpiDelta label="재방문" value={num(s.re_visits)} delta={null} />
            <KpiDelta label="재방문율" value={pct(s.re_visit_rate)} delta={null} />
            <KpiDelta
              label="전체 담기율"
              value={pct(data.bottleneck.cart_rate, 2)}
              delta={null}
            />
            <KpiDelta label="담기→주문" value={pct(data.bottleneck.order_rate)} delta={null} />
          </div>

          <MultiLineChart
            title="일자별 방문 · 신규 · 재방문 (카페24 기준)"
            series={["visits", "first_visits", "re_visits"]}
            rows={data.trend.map((r) => ({
              date: r.date,
              visits: r.visits ?? 0,
              first_visits: r.first_visits ?? 0,
              re_visits: r.re_visits ?? 0,
            }))}
          />

          <h2 className="section-title">① 상품별 구매 퍼널 — 어느 상품이 막고 있나</h2>
          <FunnelSection data={data} />

          <h2 className="section-title">② 자연 검색 유입 검색어 — 광고비 없이 들어오는 말</h2>
          <RankedTable
            title="검색어별 방문"
            unit="검색어"
            rows={data.keywords}
            cmpFrom={data.cmp_from}
            cmpTo={data.cmp_to}
            note="네이버·구글이 검색어를 가려 GA4로는 볼 수 없는 데이터입니다. 광고 히스토리 탭의 유료 키워드와 비교해 보세요."
          />

          <h2 className="section-title">③ 유입처 — 어디를 거쳐서 오나</h2>
          <div className="two-col">
            <RankedTable
              title="유입 도메인"
              unit="도메인"
              rows={data.referrers}
              cmpFrom={data.cmp_from}
              cmpTo={data.cmp_to}
              note="'참조 도메인 없음' = 주소 직접 입력·앱 내 이동·북마크 등."
            />
            <RankedTable
              title="광고 채널별 방문"
              unit="채널"
              rows={data.ads}
              cmpFrom={data.cmp_from}
              cmpTo={data.cmp_to}
              note="GA4 채널 집계와 교차검증용입니다. 정의가 달라 숫자는 서로 다릅니다."
            />
          </div>

          <h2 className="section-title">④ 회원 vs 비회원</h2>
          <MemberSection data={data} />

          <div className="card">
            <h2>페이지별 조회 (URL 기준)</h2>
            <div className="table-wrap">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>페이지</th>
                    <th>조회</th>
                    <th>방문</th>
                    <th>신규 방문</th>
                    <th>방문당 조회</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pages.map((p) => (
                    <tr key={p.url}>
                      <td className="left" title={p.url}>{p.url}</td>
                      <td>{num(p.views)}</td>
                      <td>{num(p.visits)}</td>
                      <td>{num(p.first_visits)}</td>
                      <td>{p.views_per_visit ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              방문당 조회가 <b>1에 가까우면</b> 한 페이지만 보고 나간 것입니다
              (GA4 이탈률과 같은 방향의 신호).
            </p>
          </div>
        </>
      )}
    </>
  );
}

// ── ① 상품 퍼널 ───────────────────────────────────────────────
function FunnelSection({ data }: { data: ShopAnalytics }) {
  const b = data.bottleneck;
  if (data.funnel.length === 0)
    return <div className="card"><EmptyState message="상품 퍼널 데이터가 아직 없습니다." /></div>;
  const median = b.median_cart_rate;
  const maxViews = Math.max(...data.funnel.map((r) => r.views), 1);

  return (
    <>
      {b.laggards.length > 0 && (
        <div className="card warn-card">
          <h2>담기율이 유독 낮은 상품</h2>
          <p className="muted">
            조회는 많은데 장바구니에 담기지 않는 상품입니다 (전체 중위값{" "}
            <b>{pct(median, 2)}</b>의 절반 미만). <b>가격 · 옵션(사이즈/색상) · 품절 ·
            상세페이지</b>를 먼저 점검하세요.
          </p>
          <div className="table-wrap">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>상품</th>
                  <th>조회</th>
                  <th>담기</th>
                  <th>담기율</th>
                  <th>주문</th>
                </tr>
              </thead>
              <tbody>
                {b.laggards.map((r) => (
                  <tr key={r.product_no} className="warn-row">
                    <td className="left" title={r.product}>{r.product}</td>
                    <td>{num(r.views)}</td>
                    <td>{num(r.cart_adds)}</td>
                    <td className="strong">{pct(r.cart_rate, 2)}</td>
                    <td>{num(r.orders)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h2>상품별 조회 → 담기 → 주문</h2>
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th>상품</th>
                <th>조회</th>
                <th>담기</th>
                <th>담기율</th>
                <th>주문</th>
                <th>담기→주문</th>
                <th>조회→주문</th>
                <th>매출</th>
              </tr>
            </thead>
            <tbody>
              {data.funnel.map((r) => (
                <tr key={r.product_no} className={isLagging(r, median) ? "warn-row" : ""}>
                  <td className="left" title={r.product}>
                    {r.product}
                    <div className="minibar">
                      <span style={{ width: `${(r.views / maxViews) * 100}%` }} />
                    </div>
                  </td>
                  <td>{num(r.views)}</td>
                  <td>{num(r.cart_adds)}</td>
                  <td className="strong">{pct(r.cart_rate, 2)}</td>
                  <td>{num(r.orders)}</td>
                  <td>{pct(r.order_rate)}</td>
                  <td>{pct(r.overall_rate, 2)}</td>
                  <td>{won(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          <b>담기율</b>이 낮으면 상품 자체(가격·옵션·품절·상세페이지) 문제,{" "}
          <b>담기→주문</b>이 낮으면 결제 단계(배송비·결제수단·재고) 문제입니다.
          GA4 퍼널이 "장바구니 담기"를 병목으로 지목했을 때 이 표에서 범인을 찾습니다.
        </p>
      </div>
    </>
  );
}

const isLagging = (r: ShopFunnelRow, median: number | null) =>
  median != null && r.cart_rate != null && r.cart_rate < median / 2;

// ── ②③ 순위표 (검색어 / 도메인 / 광고채널) ────────────────────
function RankedTable({
  title,
  unit,
  rows,
  cmpFrom,
  cmpTo,
  note,
}: {
  title: string;
  unit: string;
  rows: ShopRankedRow[];
  cmpFrom: string;
  cmpTo: string;
  note: string;
}) {
  if (rows.length === 0)
    return <div className="card"><EmptyState message={`${title} 데이터가 아직 없습니다.`} /></div>;
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="table-wrap">
        <table className="grid-table">
          <thead>
            <tr>
              <th>{unit}</th>
              <th>방문</th>
              <th>비중</th>
              <th>이전 기간</th>
              <th>증감</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = formatDelta(r.delta);
              return (
                <tr key={r.name}>
                  <td className="left">
                    {r.name}
                    {r.is_new && <span className="badge">신규</span>}
                  </td>
                  <td>{num(r.visits)}</td>
                  <td>{pct(r.share)}</td>
                  <td>{num(r.prev_visits)}</td>
                  <td className={`delta ${d.cls}`}>{d.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        비교기간 {cmpFrom}~{cmpTo} 대비. {note}
      </p>
    </div>
  );
}

// ── ④ 회원 / 비회원 ───────────────────────────────────────────
function MemberSection({ data }: { data: ShopAnalytics }) {
  const m = data.member;
  const total = m.member_orders + m.nonmember_orders;
  if (total === 0)
    return <div className="card"><EmptyState message="회원/비회원 데이터가 아직 없습니다." /></div>;
  return (
    <div className="card">
      <h2>회원 · 비회원 주문 비교</h2>
      <div className="table-wrap">
        <table className="grid-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>주문수</th>
              <th>매출</th>
              <th>객단가</th>
              <th>주문 비중</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="left">회원</td>
              <td>{num(m.member_orders)}</td>
              <td>{won(m.member_amount)}</td>
              <td>{won(m.member_aov)}</td>
              <td>{pct(100 - (m.nonmember_order_share ?? 0))}</td>
            </tr>
            <tr>
              <td className="left">비회원</td>
              <td>{num(m.nonmember_orders)}</td>
              <td>{won(m.nonmember_amount)}</td>
              <td>{won(m.nonmember_aov)}</td>
              <td className="strong">{pct(m.nonmember_order_share)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted">
        비회원 비중이 높으면 <b>재구매를 붙일 여지가 큽니다</b> — 가입 혜택·CRM 발송 대상이
        늘어나기 때문입니다.
      </p>
    </div>
  );
}
