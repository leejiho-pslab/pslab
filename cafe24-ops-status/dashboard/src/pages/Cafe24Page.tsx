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
import { CategoryBar } from "../components/CategoryBar";
import { BestTable } from "../components/BestTable";
import { CRMCards } from "../components/CRMCards";
import { NewReturningChart } from "../components/NewReturningChart";
import { AdCostChart } from "../components/AdCostChart";
import { PlannedGroups } from "../components/PlannedGroups";
import { RangePicker } from "../components/RangePicker";
import { Loading, ErrorState } from "../components/States";

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
      api.summary(to),
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
            <CategoryBar items={detail?.category ?? []} title="카테고리 매출 TOP 10" />
          </div>
          <div className="two-col">
            <BestTable items={detail?.best ?? []} />
            <CRMCards crm={detail?.crm ?? {}} />
          </div>
          <DailyTable rows={daily} metrics={config.summary_cards} />
          <PlannedGroups config={config} />
        </>
      )}
    </>
  );
}
