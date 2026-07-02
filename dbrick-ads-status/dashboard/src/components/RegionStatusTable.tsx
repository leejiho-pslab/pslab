import { useEffect, useState } from "react";
import { api } from "../api";
import type { RegionStatus } from "../types";

// 대시보드 하단 — 대표님이 관리하는 구글 시트("온라인 인입 지역 현황")를 그대로 표로 노출.
// 수동 갱신 시트라 자동 새로고침 없이 탭 진입/새로고침 시 한 번만 조회한다(서버가 5분 캐시).
export function RegionStatusTable() {
  const [data, setData] = useState<RegionStatus | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.regionStatus().then(setData).catch((e) => setErr(String(e)));
  }, []);

  if (err) return null; // 하단 부가 섹션 — 실패해도 대시보드 전체를 막지 않음
  if (!data) return null;

  return (
    <div className="card region-status">
      <h2>온라인 인입 지역 현황</h2>
      {data.error ? (
        <p className="muted">
          시트를 불러오지 못했습니다: {data.error}
          <br />
          서비스계정을 쓰는 경우 시트에 해당 이메일이 뷰어로 공유돼 있는지, 아니면 시트
          공유 설정이 "링크가 있는 모든 사용자(뷰어)"인지 확인해주세요.
        </p>
      ) : data.headers.length === 0 ? (
        <p className="muted empty-state">표시할 데이터가 없습니다.</p>
      ) : (
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                {data.headers.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={j === 0 ? "left" : undefined}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
