/** Shared with policy preview; mirrors frontend ExpensePolicy for HTTP body. */
export type ExpensePolicy = {
  id: string;
  name: string;
  mccCategory: string;
  maxPerTransaction: number;
  maxPerMonth: number;
  allowedDays: number[];
  scopeType: "all" | "department" | "employee";
  scopeValue?: string;
  startDate: string;
  endDate?: string;
  active?: boolean;
};
