import type { VisitorDetail } from "../types";

const num = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(v).toLocaleString("ko-KR");
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

// metrics.yaml 방문자 그룹 — 전체/신규/재방문·재방문율·신규가입수·회원가입율.
// 신규/재방문은 GA4 newVsReturning, 회원가입율은 신규가입수/방문자.
export function VisitorDetailCard({ v }: { v: VisitorDetail }) {
  const cells: [string, string][] = [
    ["전체방문", num(v?.visitors)],
    ["신규방문", num(v?.new)],
    ["재방문", num(v?.returning)],
    ["재방문율", pct(v?.return_rate)],
    ["신규가입수", num(v?.signups)],
    ["회원가입율", pct(v?.signup_rate)],
  ];
  const empty = !v || v.visitors == null;
  return (
    <div className="card">
      <h2>방문자 상세</h2>
      {empty ? (
        <p className="muted">방문자 데이터 없음 (GA4 연동 시 신규/재방문까지 표시)</p>
      ) : (
        <div className="crm-grid">
          {cells.map(([k, val]) => (
            <div className="crm-cell" key={k}>
              <div className="crm-label">{k}</div>
              <div className="crm-value">{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
