import type { BreakdownItem } from "../types";
import { formatValue } from "../format";

export function BestTable({ items }: { items: BreakdownItem[] }) {
  return (
    <div className="card">
      <h2>베스트 상품 TOP {items.length}</h2>
      {items.length === 0 ? (
        <p className="muted">데이터 없음</p>
      ) : (
        <table className="grid-table">
          <thead>
            <tr>
              <th className="left">순위</th>
              <th className="left">상품</th>
              <th>매출</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.key}>
                <td className="left strong">{i + 1}</td>
                <td className="left">{it.key}</td>
                <td>{formatValue(it.value, "currency")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
