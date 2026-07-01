import type { MetricsConfig } from "../types";

type Status = "live" | "partial" | "missing";

// 항목별 실제 구현 상태 — "왜 비어있는지"를 숨기지 않고 그대로 보여준다.
// live: 실데이터로 위 위젯에 표시 중 / partial: 일부만(예: 브리핑 텍스트로만) 표시 중
// missing: 카페24/외부 API 로 아직 수집하지 않는 지표(연동 필요)
const STATUS: Record<string, Status> = {
  // 매출·주문
  매출합계: "live", 주문수: "live", 객단가: "live", 구매전환율: "live",
  순매출: "missing", "취소·환불금액": "missing", 환불주문수: "missing",
  // 방문자
  전체방문: "live", 신규가입수: "live",
  신규방문: "missing", 재방문: "missing", 재방문율: "missing", 회원가입율: "missing",
  // CRM
  후기수: "live",
  문자: "missing", 알림톡: "missing", 카카오: "missing",
  // 모바일(결제) / PC — 디바이스별 매출·주문·객단가·비중 표(위) 로 표시
  매출: "live", 주문건수: "live", 결제비중: "live", "PC비중": "live",
  // 재고·장바구니
  품절: "partial",
  장바구니수: "missing", 재고수량: "missing", 입고예정: "missing", 외부채널비율: "missing",
};

const REASON: Record<string, string> = {
  순매출: "환불/취소 API 미연동",
  "취소·환불금액": "환불/취소 API 미연동",
  환불주문수: "환불/취소 API 미연동",
  신규방문: "GA4 신규·재방문 세그먼트 미연동(현재는 전체 방문자수만)",
  재방문: "GA4 신규·재방문 세그먼트 미연동",
  재방문율: "GA4 신규·재방문 세그먼트 미연동",
  회원가입율: "가입 전환 분모(방문자 대비) 정의 필요",
  문자: "SMS 발송 API(NHN Toast 등) 미연동",
  알림톡: "알림톡 발송 API 미연동",
  카카오: "카카오 채널 발송 API 미연동",
  장바구니수: "카페24 장바구니 API 미연동",
  재고수량: "카페24 상품 재고 API 미연동",
  입고예정: "입고 일정 데이터 소스 없음",
  외부채널비율: "외부 판매채널(스마트스토어 등) 연동 없음",
  품절: "상단 일일 브리핑 배너에 건수로만 표시(표는 미구현)",
};

const ICON: Record<Status, string> = { live: "✅", partial: "🟡", missing: "⛔" };

// metrics.yaml 의 daily_table 그룹/차트 구성 — 실제 구현 상태를 함께 보여준다.
export function PlannedGroups({ config }: { config: MetricsConfig }) {
  return (
    <div className="card">
      <h2>
        일별 운영 데이터 · 차트 구성 <span className="badge">metrics.yaml 정의</span>
      </h2>
      <p className="muted">
        ✅ 실데이터 표시 중 · 🟡 일부만 표시 · ⛔ 데이터 소스 미연동(아래 그룹/차트 위젯 참고)
      </p>
      <div className="group-grid">
        {config.daily_groups.map((g) => (
          <div className="group-card" key={g.name}>
            <div className="group-title">{g.name}</div>
            <div className="chips">
              {(g.metrics ?? (g.top_n ? [`TOP ${g.top_n}`] : [])).map((m) => {
                const st = STATUS[m] ?? "live";
                return (
                  <span className={`chip status-${st}`} key={m} title={REASON[m]}>
                    {ICON[st]} {m}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="chips chart-chips">
        {config.charts.map((c) => (
          <span className="chip chart" key={c.title}>
            {c.title}
          </span>
        ))}
      </div>
    </div>
  );
}
