import { useEffect, useState } from "react";
import { api } from "../api";
import { daysBefore } from "../util";
import type {
  DailyDetailResponse,
  DailyRow,
  MetricsConfig,
  PeriodRow,
  SummaryCard,
  TrendRow,
} from "../types";
import { SummaryCards } from "../components/SummaryCards";
import { PeriodTable } from "../components/PeriodTable";
import { DailyTable } from "../components/DailyTable";
import { SalesChart } from "../components/SalesChart";
import { DeviceDonut } from "../components/DeviceDonut";
import { DevicePerfTable } from "../components/DevicePerfTable";
import { CategoryBar } from "../components/CategoryBar";
import { BestTable } from "../components/BestTable";
import { VisitorDetailCard } from "../components/VisitorDetailCard";
import { VisitorChart } from "../components/VisitorChart";
import { SignupTrendChart } from "../components/SignupTrendChart";
import { NewReturningChart } from "../components/NewReturningChart";
import { AdCostChart } from "../components/AdCostChart";
import { PlannedGroups } from "../components/PlannedGroups";
import { RangePicker } from "../components/RangePicker";
import { ShopAnalyticsSection } from "../components/ShopAnalyticsSection";
import { Loading, ErrorState } from "../components/States";

// 방문자 추이 그래프는 2026년 6월부터 전체를 보여준다(상단 기간 선택과 별개, 장기 흐름용).
const VISITOR_TREND_FROM = "2026-06-01";

export function Cafe24Page({ date, config }: { date: string; config: MetricsConfig }) {
  const [from, setFrom] = useState(() => daysBefore(date, 13));
  const [to, setTo] = useState(date);
  const [cards, setCards] = useState<SummaryCard[]>([]);
  const [period, setPeriod] = useState<PeriodRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [detail, setDetail] = useState<DailyDetailResponse | null>(null);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setFrom(daysBefore(date, 13));
    setTo(date);
  }, [date]);

  useEffect(() => {
    Promise.all([
      api.summary(from, to),
      api.periodComparison(to),
      api.daily(from, to),
      api.dailyDetail(to),
      api.trend(from, to),
    ])
      .then(([s, p, d, dd, tr]) => {
        setCards(s.cards);
        setPeriod(p.rows);
        setDaily(d.rows);
        setDetail(dd);
        setTrend(tr.rows);
        setLoaded(true);
      })
      .catch((e) => setErr(String(e)));
  }, [from, to]);

  return (
    <>
      <RangePicker base={date} from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      {err ? (
        <ErrorState error={err} />
      ) : !loaded ? (
        <Loading rows={3} />
      ) : (
        <>
          <SummaryCards cards={cards} />
          <PeriodTable rows={period} />
          <SalesChart rows={daily} />
          <div className="two-col">
            <NewReturningChart rows={trend} />
            <AdCostChart rows={trend} />
          </div>
          <div className="two-col">
            <DeviceDonut items={detail?.device ?? []} />
            <DevicePerfTable items={detail?.device_perf ?? []} />
          </div>
          <div className="two-col">
            <VisitorDetailCard v={detail?.visitor ?? ({} as never)} />
            <SignupTrendChart from={from} to={to} />
          </div>
          <VisitorChart from={VISITOR_TREND_FROM} to={to} />
          <CategoryBar items={detail?.category ?? []} title="카테고리 매출 TOP 10" />
          <BestTable items={detail?.best ?? []} />
          <ShopAnalyticsSection from={from} to={to} />
          <DailyTable rows={daily} metrics={config.summary_cards} />
          <PlannedGroups config={config} />
        </>
      )}
    </>
  );
}
