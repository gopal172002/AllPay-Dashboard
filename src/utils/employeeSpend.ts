import dayjs from "dayjs";
import type { Transaction } from "../types";
import type { EmployeeSpendResponse } from "../api/employeeApi";

export const SPEND_CATEGORY_ORDER = [
  "Fuel",
  "Office Supplies",
  "Travel",
  "Lodging",
  "Bars/Alcohol",
  "Meals",
] as const;

export function computeEmployeeSpendFromTransactions(
  transactions: Transaction[],
  rangeDays: number
): EmployeeSpendResponse {
  const end = dayjs().endOf("day");
  const start = end.subtract(rangeDays, "day").startOf("day");

  const inRange = transactions.filter((tx) => {
    const d = dayjs(tx.dateTime);
    return !d.isBefore(start) && !d.isAfter(end);
  });

  let approvedInRange = 0;
  let pendingInRange = 0;
  const totals = new Map<string, number>();

  for (const tx of inRange) {
    if (tx.status === "approved") approvedInRange += tx.amount;
    if (tx.status === "pending") pendingInRange += tx.amount;
    totals.set(tx.category, (totals.get(tx.category) || 0) + tx.amount);
  }

  const byCategory = SPEND_CATEGORY_ORDER.map((category) => ({
    category,
    total: totals.get(category) || 0,
  }));

  return {
    rangeDays,
    rangeLabel: `Last ${rangeDays} days`,
    dateRange: {
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD"),
    },
    approvedInRange,
    pendingInRange,
    transactionCount: inRange.length,
    byCategory,
  };
}
