import dayjs from "dayjs";
import type { ITransaction } from "../models";
import type { ExpensePolicy } from "./analyticsTypes";

export type PolicyPreviewMatch = {
  transactionId: string;
  reasons: string[];
  amount: number;
  employeeId: string;
  employeeName: string;
  category: string;
};

type LeanTx = {
  id: string;
  amount: number;
  dateTime: string;
  category: string;
  employeeId: string;
  employeeName: string;
  department: string;
};

function inScope(tx: LeanTx, policy: ExpensePolicy): boolean {
  if (policy.scopeType === "all") return true;
  if (policy.scopeType === "department" && policy.scopeValue) {
    return tx.department === policy.scopeValue;
  }
  if (policy.scopeType === "employee" && policy.scopeValue) {
    return tx.employeeId === policy.scopeValue;
  }
  return true;
}

function withinPolicyDateRange(tx: LeanTx, policy: ExpensePolicy): boolean {
  const t = dayjs(tx.dateTime);
  if (policy.startDate && t.isBefore(dayjs(policy.startDate).startOf("day"), "day")) {
    return false;
  }
  if (policy.endDate && t.isAfter(dayjs(policy.endDate).endOf("day"), "day")) {
    return false;
  }
  return true;
}

export function runPolicyPreview(
  transactions: ITransaction[] | Record<string, unknown>[],
  policy: ExpensePolicy
) {
  const lean: LeanTx[] = transactions.map((t) => {
    const o = t as Record<string, unknown>;
    return {
      id: String(o["id"] ?? ""),
      amount: Number(o["amount"] ?? 0),
      dateTime: String(o["dateTime"] ?? ""),
      category: String(o["category"] ?? ""),
      employeeId: String(o["employeeId"] ?? ""),
      employeeName: String(o["employeeName"] ?? ""),
      department: String(o["department"] ?? "")
    };
  });

  const dateFiltered = lean.filter((tx) => withinPolicyDateRange(tx, policy));
  const inPolicyScope = dateFiltered.filter((tx) => inScope(tx, policy));
  const inCategory = inPolicyScope.filter(
    (tx) => !policy.mccCategory || tx.category === policy.mccCategory
  );

  const byEmpMonth = new Map<string, number>();
  if (policy.maxPerMonth && policy.mccCategory) {
    for (const tx of inCategory) {
      if (tx.category !== policy.mccCategory) continue;
      const k = `${tx.employeeId}|${dayjs(tx.dateTime).format("YYYY-MM")}`;
      byEmpMonth.set(k, (byEmpMonth.get(k) || 0) + tx.amount);
    }
  }

  const matches: PolicyPreviewMatch[] = [];
  for (const tx of inCategory) {
    const reasons: string[] = [];
    if (policy.maxPerTransaction && tx.amount > policy.maxPerTransaction) {
      reasons.push("Amount exceeds per-transaction cap");
    }
    const dow = dayjs(tx.dateTime).day();
    if (policy.allowedDays?.length && !policy.allowedDays.includes(dow)) {
      reasons.push("Not on an allowed weekday");
    }
    const ym = `${tx.employeeId}|${dayjs(tx.dateTime).format("YYYY-MM")}`;
    if (policy.mccCategory && policy.maxPerMonth) {
      const run = byEmpMonth.get(ym) || 0;
      if (run > policy.maxPerMonth) {
        reasons.push("Monthly spend for this category over cap in this calendar month");
      }
    }
    if (reasons.length) {
      matches.push({
        transactionId: tx.id,
        reasons,
        amount: tx.amount,
        employeeId: tx.employeeId,
        employeeName: tx.employeeName,
        category: tx.category
      });
    }
  }

  const employeeIds = new Set(matches.map((m) => m.employeeId));
  const amountSum = matches.reduce((s, m) => s + m.amount, 0);
  const estimatedSavingsIfRejected = Math.round(amountSum * 100) / 100;

  return {
    wouldFlagCount: matches.length,
    affectedEmployeeCount: employeeIds.size,
    affectedEmployeeIds: [...employeeIds],
    estimatedSavingsIfRejected,
    matches: matches.slice(0, 200),
    hasMore: matches.length > 200
  };
}
