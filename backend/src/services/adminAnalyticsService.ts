import dayjs from "dayjs";
import { Transaction } from "../models";

export type DailySpendResult = {
  date: string;
  totalSpend: number;
  transactionCount: number;
  byCategory: { category: string; total: number; count: number }[];
};

export type TimelineBucket = "daily" | "weekly" | "monthly";

export type AggregatedAnalyticsResult = {
  dateRange: { start: string; end: string };
  kpis: {
    totalSpend: number;
    transactionCount: number;
    averageTransaction: number;
    approvedSpend: number;
    pendingSpend: number;
    rejectedAmount: number;
    rejectedCount: number;
    flaggedCount: number;
  };
  byCategory: { category: string; total: number; count: number }[];
  byEmployee: { employeeId: string; employeeName: string; total: number; count: number }[];
  timeline: { period: string; total: number; count: number }[];
  topSpenders: { employeeId: string; employeeName: string; total: number }[];
};

type LeanTx = {
  amount: number;
  dateTime: string;
  category: string;
  employeeId: string;
  employeeName: string;
  status: string;
  flags: { length: number } | unknown[];
};

function toLean(
  t: { amount: number; dateTime: string; category: string; employeeId: string; employeeName: string; status: string; flags?: unknown }
): LeanTx {
  return {
    amount: Number(t.amount),
    dateTime: t.dateTime,
    category: t.category,
    employeeId: t.employeeId,
    employeeName: t.employeeName,
    status: t.status,
    flags: Array.isArray(t.flags) ? t.flags : []
  };
}

export function computeAggregatedFromTxs(
  rows: LeanTx[],
  start: string,
  end: string,
  timelineBucket: TimelineBucket
): AggregatedAnalyticsResult {
  const byCategory = new Map<string, { total: number; count: number }>();
  const byEmployee = new Map<string, { name: string; total: number; count: number }>();
  const timeline = new Map<string, { total: number; count: number }>();
  let totalSpend = 0;
  let approvedSpend = 0;
  let pendingSpend = 0;
  let rejectedAmount = 0;
  let rejectedCount = 0;
  let flaggedCount = 0;

  for (const tx of rows) {
    const flags = Array.isArray(tx.flags) ? tx.flags : [];
    const n = flags.length;
    const isFlagged = tx.status === "flagged" || n > 0;
    if (isFlagged) {
      flaggedCount += 1;
    }

    const amt = tx.amount;
    totalSpend += amt;

    if (tx.status === "approved") {
      approvedSpend += amt;
    } else if (tx.status === "pending") {
      pendingSpend += amt;
    } else if (tx.status === "rejected") {
      rejectedAmount += amt;
      rejectedCount += 1;
    } else if (tx.status === "flagged") {
      pendingSpend += amt;
    } else {
      pendingSpend += amt;
    }

    const cat = tx.category || "—";
    const c0 = byCategory.get(cat) || { total: 0, count: 0 };
    c0.total += amt;
    c0.count += 1;
    byCategory.set(cat, c0);

    const e0 = byEmployee.get(tx.employeeId) || { name: tx.employeeName, total: 0, count: 0 };
    e0.total += amt;
    e0.count += 1;
    e0.name = tx.employeeName;
    byEmployee.set(tx.employeeId, e0);

    const d = dayjs(tx.dateTime);
    let key: string;
    if (timelineBucket === "monthly") {
      key = d.format("YYYY-MM");
    } else if (timelineBucket === "weekly") {
      key = d.startOf("week").format("YYYY-MM-DD");
    } else {
      key = d.format("YYYY-MM-DD");
    }
    const t0 = timeline.get(key) || { total: 0, count: 0 };
    t0.total += amt;
    t0.count += 1;
    timeline.set(key, t0);
  }

  const byCategoryList = [...byCategory.entries()]
    .map(([category, v]) => ({ category, total: Math.round(v.total * 100) / 100, count: v.count }))
    .sort((a, b) => b.total - a.total);

  const byEmployeeList = [...byEmployee.entries()]
    .map(([employeeId, v]) => ({
      employeeId,
      employeeName: v.name,
      total: Math.round(v.total * 100) / 100,
      count: v.count
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30);

  const topSpenders = byEmployeeList.slice(0, 8).map((e) => ({
    employeeId: e.employeeId,
    employeeName: e.employeeName,
    total: e.total
  }));

  const timelineList = [...timeline.entries()]
    .map(([period, v]) => ({
      period,
      total: Math.round(v.total * 100) / 100,
      count: v.count
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const n = rows.length;
  return {
    dateRange: { start, end },
    kpis: {
      totalSpend: Math.round(totalSpend * 100) / 100,
      transactionCount: n,
      averageTransaction: n ? Math.round((totalSpend / n) * 100) / 100 : 0,
      approvedSpend: Math.round(approvedSpend * 100) / 100,
      pendingSpend: Math.round(pendingSpend * 100) / 100,
      rejectedAmount: Math.round(rejectedAmount * 100) / 100,
      rejectedCount,
      flaggedCount
    },
    byCategory: byCategoryList,
    byEmployee: byEmployeeList,
    timeline: timelineList,
    topSpenders
  };
}

export function computeDailySpendFromTxs(rows: LeanTx[], ymd: string): DailySpendResult {
  const byCategory = new Map<string, { total: number; count: number }>();
  let totalSpend = 0;
  for (const tx of rows) {
    totalSpend += tx.amount;
    const cat = tx.category || "—";
    const c0 = byCategory.get(cat) || { total: 0, count: 0 };
    c0.total += tx.amount;
    c0.count += 1;
    byCategory.set(cat, c0);
  }
  return {
    date: ymd,
    totalSpend: Math.round(totalSpend * 100) / 100,
    transactionCount: rows.length,
    byCategory: [...byCategory.entries()]
      .map(([category, v]) => ({
        category,
        total: Math.round(v.total * 100) / 100,
        count: v.count
      }))
      .sort((a, b) => b.total - a.total)
  };
}

function rangeIso(startDay: dayjs.Dayjs, endDay: dayjs.Dayjs) {
  return {
    gte: startDay.startOf("day").toISOString(),
    lte: endDay.endOf("day").toISOString()
  };
}

export async function getDailySpend(dateYmd: string | undefined) {
  const d = dateYmd ? dayjs(dateYmd, "YYYY-MM-DD", true) : dayjs();
  const ymd = d.isValid() ? d.format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
  const day = dayjs(ymd, "YYYY-MM-DD");
  const { gte, lte } = rangeIso(day, day);
  const raw = await Transaction.find({ dateTime: { $gte: gte, $lte: lte } })
    .select("amount dateTime category status flags employeeId employeeName")
    .lean();
  const rows = (raw as unknown as LeanTx[]).map((t) => toLean(t as any));
  return computeDailySpendFromTxs(rows, ymd);
}

export async function getAggregated(
  startDate: string | undefined,
  endDate: string | undefined,
  timelineBucket: TimelineBucket
) {
  const end = endDate ? dayjs(endDate) : dayjs();
  const start = startDate
    ? dayjs(startDate)
    : end.subtract(30, "day");
  const s = start.startOf("day");
  const e = end.endOf("day");
  const { gte, lte } = rangeIso(s, e);
  const raw = await Transaction.find({ dateTime: { $gte: gte, $lte: lte } })
    .select("amount dateTime category status flags employeeId employeeName")
    .lean();
  const rows = (raw as unknown as LeanTx[]).map((t) => toLean(t as any));
  return computeAggregatedFromTxs(
    rows,
    s.toISOString(),
    e.toISOString(),
    timelineBucket
  );
}
