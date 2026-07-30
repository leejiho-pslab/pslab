import { useEffect, useState } from "react";
import { api } from "../api";
import { formatValue, formatDelta } from "../format";
import type { ShopAnalytics, ShopFunnelRow, ShopRankedRow } from "../types";
import { EmptyState } from "./States";

// 카페24 접속통계 — '카페24 어드민' 탭 안에 함께 보이는 섹션.
// 별도 탭으로 두지 않는 이유: 상품 담기율은 베스트 상품·카테고리 매출과 나란히 봐야
// 의미가 살고(조회는 많은데 안 팔리는 상품), 유입 검색어도 방문자 지표 옆이 자연스럽다.
//
// 상단 KPI 카드와 방문 추이는 **일부러 넣지 않았다** — 어드민 탭에 이미 방문자/신규/재방문
// 카드와 추이 그래프가 있고(GA4 기준), 카페24 '방문' 은 정의가 달라 나란히 두면 오해를 준다.
// 대신 정의 차이를 헤더 한 줄로 밝히고, GA4 가 못 주는 것만 여기에 담는다.

const num = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(v).toLocaleString("ko-KR");
const won = (v: number | null | undefined) => (v == null ? "—" : formatValue(v, "currency"));
const pct = (v: number | null | undefined, digits = 1) =>
  v == null ? "—" : `${v.toFixed(digits)}%`;

const isLagging = (r: ShopFunnelRow, median: number | null) =>
  median != null && r.cart_rate != null && r.cart_rate < median / 2;

export function ShopAnalyticsSection({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<ShopAnalytics | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr("");
    api.shopAnalytics(from, to).then(setData).catch((e) => setErr(String(e)));
  }, [from, to]);

  // 수집 전이거나 권한이 없으면 이 섹션만 조용히 접는다 — 어드민 탭의 나머지는 그대로 보여야 한다.
  if (err) return null;
  if (!data) return null;
  const s = data.summary;
  if (!s || s.days === 0) return null;

  return (
    <>
      <h2 className="section-title">
        카페24 접속통계 · 상품 담기율
        <span className="muted sub-note">
          기간 방문 {num(s.visits)} · 재방문율 {pct(s.re_visit_rate)}
          {" "}(카페24 '방문' 기준 — 상단 방문자 카드는 GA4 '사용자' 기준이라 숫자가 다릅니다)
        </span>
      </h2>

      <FunnelBlock data={data} />

      <RankedTable
        title="자연 검색 유입 검색어"
        unit="검색어"
        rows={data.keywords}
        cmpFrom={data.cmp_from}
        cmpTo={data.cmp_to}
        note="네이버·구글이 검색어를 가려 GA4로는 볼 수 없는 데이터입니다. 광고 히스토리 탭의 유료 키워드와 비교해 보세요."
      />

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
          note="GA4 채널 집계와 교차검증용입니다."
        />
      </div>

      <div className="two-col">
        <MemberBlock data={data} />
        <PageBlock data={data} />
      </div>
    </>
  );
}

// ── 상품 퍼널 (조회 → 담기 → 주문) ────────────────────────────
function FunnelBlock({ data }: { data: ShopAnalytics }) {
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
            <b>{pct(median, 2)}</b>의 절반 미만). <b>품절 · 옵션(사이즈/색상) · 가격 ·
            상세페이지 상단</b> 순서로 점검하세요.
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
          <b>담기율</b>이 낮으면 상품 자체(품절·옵션·가격·상세페이지) 문제,{" "}
          <b>담기→주문</b>이 낮으면 결제 단계(배송비·결제수단·재고) 문제입니다.
          GA4 탭 퍼널이 "장바구니 담기"를 병목으로 지목했을 때 이 표에서 범인을 찾습니다.
        </p>
      </div>
    </>
  );
}

// ── 순위표 (검색어 / 도메인 / 광고채널) ───────────────────────
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
      <p className="muted">비교기간 {cmpFrom}~{cmpTo} 대비. {note}</p>
    </div>
  );
}

// ── 회원 / 비회원 ─────────────────────────────────────────────
function MemberBlock({ data }: { data: ShopAnalytics }) {
  const m = data.member;
  if (m.member_orders + m.nonmember_orders === 0)
    return <div className="card"><EmptyState message="회원/비회원 데이터가 아직 없습니다." /></div>;
  return (
    <div className="card">
      <h2>회원 · 비회원 주문</h2>
      <div className="table-wrap">
        <table className="grid-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>주문수</th>
              <th>매출</th>
              <th>객단가</th>
              <th>비중</th>
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
        비회원 비중이 높으면 <b>재구매를 붙일 여지가 큽니다</b> — 가입 혜택·CRM 대상이 늘기 때문.
      </p>
    </div>
  );
}

// ── 페이지별 조회 (URL) ───────────────────────────────────────
function PageBlock({ data }: { data: ShopAnalytics }) {
  if (data.pages.length === 0)
    return <div className="card"><EmptyState message="페이지 데이터가 아직 없습니다." /></div>;
  return (
    <div className="card">
      <h2>페이지별 조회 (URL)</h2>
      <div className="table-wrap">
        <table className="grid-table">
          <thead>
            <tr>
              <th>페이지</th>
              <th>조회</th>
              <th>방문</th>
              <th>방문당</th>
            </tr>
          </thead>
          <tbody>
            {data.pages.slice(0, 10).map((p) => (
              <tr key={p.url}>
                <td className="left" title={p.url}>{p.url}</td>
                <td>{num(p.views)}</td>
                <td>{num(p.visits)}</td>
                <td>{p.views_per_visit ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        방문당 조회가 <b>1에 가까우면</b> 한 페이지만 보고 나간 것입니다.
      </p>
    </div>
  );
}
