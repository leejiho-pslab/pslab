import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { MonthlyReport, MrDelta } from "../types";
import { Loading, ErrorState } from "../components/States";

const dcls = (d?: MrDelta) => (d ? `mr-d ${d.dir}` : "mr-d flat");

function Sec({ n, title }: { n: string; title: string }) {
  return (
    <h2 className="mr-sec">
      <span className="mr-sec-n">{n}</span>
      {title}
    </h2>
  );
}

// 월간 리포트 — 매월 1일 지난달 리포트가 자동으로 기본 선택된다(수집 데이터 기준).
// 데이터·표·좋아진/아쉬운은 자동 생성, 전략은 편집용 초안. Word(.docx) 다운로드 제공.
export function MonthlyReportPage({ dates }: { dates: string[] }) {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<MonthlyReport | null>(null);
  const [err, setErr] = useState("");

  // 데이터가 있는 월 목록(내림차순)
  const months = useMemo(
    () => Array.from(new Set(dates.map((d) => d.slice(0, 7)))).sort().reverse(),
    [dates],
  );

  useEffect(() => {
    setData(null);
    setErr("");
    api.reportMonthly(month).then((r) => { setData(r); if (!month) setMonth(r.target); })
      .catch((e) => setErr(String(e)));
  }, [month]);

  if (err) return <ErrorState error={err} />;
  if (!data) return <Loading rows={4} />;

  return (
    <div className="mr">
      {/* 헤더 */}
      <div className="mr-head">
        <div>
          <div className="mr-eyebrow">디브릭 · 온라인 광고 월간 리포트</div>
          <h1 className="mr-title">{data.compare_label} → {data.target_label} 성과 비교</h1>
          <div className="mr-sub">리드젠(웹문의) 기준 · 결과(문의)·CPA·CPC·CTR 중심</div>
        </div>
        <div className="mr-actions">
          <select value={month ?? data.target} onChange={(e) => setMonth(e.target.value)} aria-label="리포트 월 선택">
            {(months.length ? months : [data.target]).map((m) => (
              <option key={m} value={m}>{m.replace("-", "년 ")}월 리포트</option>
            ))}
          </select>
          <a className="mr-dl" href={api.reportDocxUrl(month)}>⬇ Word 다운로드</a>
        </div>
      </div>

      <div className="mr-headline"><b>한 문장 요약 —</b> {data.headline}</div>
      <p className="mr-auto">매월 1일, 지난달 리포트가 이 화면에 자동으로 생성됩니다. 표·증감·좋아진/아쉬운은 데이터로 자동 작성되고, 아래 <b>전략은 편집용 초안</b>입니다.</p>

      {/* 01 한 장 요약 */}
      <Sec n="01" title="한 장 요약 · 계정 전체" />
      <div className="tw">
        <table className="grid-table mr-table">
          <thead><tr><th className="left">지표</th><th>{data.compare_label}</th><th>{data.target_label}</th><th>증감</th></tr></thead>
          <tbody>
            {data.kpi_rows.map((k) => (
              <tr key={k.label}>
                <td className="left strong">{k.label}</td>
                <td>{k.a}</td><td className="strong">{k.b}</td>
                <td className={dcls(k.delta)}>{k.delta.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 02 좋아진 / 아쉬운 */}
      <Sec n="02" title="좋아진 것 · 아쉬운 것" />
      <div className="two-col">
        <div className="card">
          <h3 className="mr-h3 good">◆ 개선된 지표</h3>
          <ul className="mr-list">{data.improved.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div className="card">
          <h3 className="mr-h3 bad">◆ 아쉬운 · 점검할 지표</h3>
          <ul className="mr-list">{data.declined.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      </div>

      {/* 03 매체별 비교 */}
      <Sec n="03" title={`매체별 비교 (${data.compare_label} → ${data.target_label})`} />
      <div className="tw">
        <table className="grid-table mr-table">
          <thead><tr><th className="left">채널</th><th>광고비</th><th>노출</th><th>클릭</th><th>CTR</th><th>CPC</th><th>결과</th><th>CPA</th></tr></thead>
          <tbody>
            {data.channel_rows.map((c) => (
              <tr key={c.channel}>
                <td className="left strong">{c.channel}</td>
                <td>{c.ad_cost}<span className={dcls(c.ad_cost_d)}> {c.ad_cost_d.text}</span></td>
                <td>{c.impressions}<span className={dcls(c.impressions_d)}> {c.impressions_d.text}</span></td>
                <td>{c.clicks}<span className={dcls(c.clicks_d)}> {c.clicks_d.text}</span></td>
                <td>{c.ctr}<span className={dcls(c.ctr_d)}> {c.ctr_d.text}</span></td>
                <td>{c.cpc}<span className={dcls(c.cpc_d)}> {c.cpc_d.text}</span></td>
                <td className="strong">{c.conversions}</td>
                <td className="strong">{c.cpa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mr-note"><b>해석 —</b> {data.interpretation}</p>

      {/* 04 키워드 */}
      {data.top_keywords.length > 0 && (
        <>
          <Sec n="04" title={`네이버 검색 · 키워드 흐름 (${data.target_label})`} />
          <div className="tw">
            <table className="grid-table mr-table">
              <thead><tr><th className="left">키워드</th><th className="left">캠페인</th><th>광고비</th><th>클릭</th><th>CTR</th><th>CPC</th></tr></thead>
              <tbody>
                {data.top_keywords.map((k, i) => (
                  <tr key={i}>
                    <td className="left strong">{k.keyword}</td>
                    <td className="left muted">{k.campaign}</td>
                    <td>{k.ad_cost}</td><td>{k.clicks}</td><td>{k.ctr}</td><td>{k.cpc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.keyword_note && <p className="mr-note">{data.keyword_note}</p>}
        </>
      )}

      {/* 05 전략 초안 */}
      <Sec n="05" title="핵심 인사이트 & 다음달 전략 (편집용 초안)" />
      <ol className="mr-strat">
        {data.strategy_draft.map((s, i) => (
          <li key={i}>
            <div className="mr-strat-h">{s.title}</div>
            <div className="mr-strat-b">{s.body}</div>
          </li>
        ))}
      </ol>
      <p className="mr-auto">※ 전략은 자동 초안입니다. <b>Word로 다운받아 대표님 판단으로 편집</b>해 보고에 활용하세요(지역 경쟁사 키워드 확장 등).</p>
    </div>
  );
}
