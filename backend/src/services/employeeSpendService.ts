import dayjs from "dayjs";

export const SPEND_CATEGORY_ORDER = [
  "Fuel",
  "Office Supplies",
  "Travel",
  "Lodging",
  "Bars/Alcohol",
  "Meals",
] as const;

type SpendTx = {
  amount: number;
  dateTime: string;
  category: string;
  status: string;
};

export type EmployeeSpendSummary = {
  rangeDays: number;
  rangeLabel: string;
  dateRange: { start: string; end: string };
  approvedInRange: number;
  pendingInRange: number;
  transactionCount: number;
  byCategory: { category: string; total: number }[];
};

export function computeEmployeeSpend(
  rows: SpendTx[],
  rangeDays: number
): EmployeeSpendSummary {
  const end = dayjs().endOf("day");
  const start = end.subtract(rangeDays, "day").startOf("day");

  let approvedInRange = 0;
  let pendingInRange = 0;
  const totals = new Map<string, number>();

  for (const tx of rows) {
    const amt = Number(tx.amount) || 0;
    if (tx.status === "approved") approvedInRange += amt;
    if (tx.status === "pending") pendingInRange += amt;
    const cat = tx.category || "—";
    totals.set(cat, (totals.get(cat) || 0) + amt);
  }

  const byCategory: { category: string; total: number }[] = SPEND_CATEGORY_ORDER.map((category) => ({
    category,
    total: Math.round((totals.get(category) || 0) * 100) / 100,
  }));

  for (const [category, total] of totals.entries()) {
    if (!SPEND_CATEGORY_ORDER.includes(category as (typeof SPEND_CATEGORY_ORDER)[number])) {
      byCategory.push({ category, total: Math.round(total * 100) / 100 });
    }
  }

  return {
    rangeDays,
    rangeLabel: `Last ${rangeDays} days`,
    dateRange: {
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD"),
    },
    approvedInRange: Math.round(approvedInRange * 100) / 100,
    pendingInRange: Math.round(pendingInRange * 100) / 100,
    transactionCount: rows.length,
    byCategory,
  };
}
