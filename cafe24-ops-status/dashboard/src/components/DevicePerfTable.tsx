import type { DevicePerf } from "../types";
import { formatValue } from "../format";

const LABEL: Record<string, string> = { mobile: "모바일(결제)", pc: "PC" };

// metrics.yaml 모바일(결제)/PC 그룹 — 디바이스별 매출/주문건수/객단가/비중.
export function DevicePerfTable({ items }: { items: DevicePerf[] }) {
  return (
    <div className="card">
      <h2>디바이스별 매출·주문 상세</h2>
      {items.length === 0 || items.every((i) => i.sales === 0) ? (
        <p className="muted">데이터 없음</p>
      ) : (
        <table className="grid-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>매출</th>
              <th>주문건수</th>
              <th>객단가</th>
              <th>비중</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.device}>
                <td>{LABEL[it.device] ?? it.device}</td>
                <td>{formatValue(it.sales, "currency")}</td>
                <td>{formatValue(it.order_count, "count")}</td>
                <td>{it.aov != null ? formatValue(it.aov, "currency") : "—"}</td>
                <td>{it.share != null ? `${it.share}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
