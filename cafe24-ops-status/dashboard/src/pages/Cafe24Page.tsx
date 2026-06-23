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

export function Cafe24Page({ date, config }: { date: string; config: MetricsConfig }) {
  const [cards, setCards] = useState<SummaryCard[]>([]);
  const [period, setPeriod] = useState<PeriodRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [detail, setDetail] = useState<DailyDetailResponse | null>(null);
  const [trend, setTrend] = useState<TrendRow[]>([]);

  useEffect(() => {
    if (!date) return;
    const from = daysBefore(date, 13);
    Promise.all([
      api.summary(date),
      api.periodComparison(date),
      api.daily(from, date),
      api.dailyDetail(date),
      api.trend(from, date),
    ]).then(([s, p, d, dd, tr]) => {
      setCards(s.cards);
      setPeriod(p.rows);
      setDaily(d.rows);
      setDetail(dd);
      setTrend(tr.rows);
    });
  }, [date]);

  return (
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
  );
}
