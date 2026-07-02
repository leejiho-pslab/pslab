const LABEL: Record<string, string> = {
  sms: "문자",
  alimtalk: "알림톡",
  kakao: "카카오",
  reviews: "후기수",
};

export function CRMCards({ crm }: { crm: Record<string, number> }) {
  const keys = Object.keys(LABEL).filter((k) => k in crm);
  return (
    <div className="card">
      <h2>CRM</h2>
      {keys.length === 0 ? (
        <p className="muted">데이터 없음</p>
      ) : (
        <div className="crm-grid">
          {keys.map((k) => (
            <div className="crm-cell" key={k}>
              <div className="crm-label">{LABEL[k]}</div>
              <div className="crm-value">{Math.round(crm[k]).toLocaleString("ko-KR")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
