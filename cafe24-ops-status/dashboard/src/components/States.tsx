// 공통 상태 표시 — 로딩 / 빈 / 에러

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="loading">
      <div className="kpi-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="kpi-card skel-card" key={i}>
            <div className="skel skel-line short" />
            <div className="skel skel-line" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="card skel-card" key={i}>
          <div className="skel skel-line short" />
          <div className="skel skel-block" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ message = "데이터가 없습니다." }: { message?: string }) {
  return <p className="muted empty-state">{message}</p>;
}

export function ErrorState({ error }: { error: string }) {
  return (
    <div className="card error">
      <b>데이터를 불러오지 못했습니다.</b>
      <p className="muted">{error}</p>
    </div>
  );
}
