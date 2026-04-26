export type TransactionStatus = "pending" | "approved" | "rejected" | "flagged";
export type AdminRole = "super_admin" | "finance_manager" | "hr_manager" | "auditor";

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  role: "employee" | "manager";
  active: boolean;
  onboarded: boolean;
  travelApproved: boolean;
  /** Set when the employee was created via admin invite (for future onboarding link). */
  inviteToken?: string;
}

export interface TransactionFlag {
  id: string;
  rule: string;
  reason: string;
  details: string;
}

export interface TimelineEvent {
  id: string;
  actor: string;
  action: string;
  timestamp: string;
}

export interface Transaction {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  merchantName: string;
  mcc: string;
  category: string;
  amount: number;
  claimedAmount: number;
  dateTime: string;
  status: TransactionStatus;
  upiApp: "GPay" | "PhonePe" | "Paytm" | "BHIM";
  upiRefId: string;
  isNew: boolean;
  flags: TransactionFlag[];
  adminDecision?: string;
  adminDecisionAt?: string;
  receiptUrl?: string;
  hasMatchingAllpayRecord: boolean;
  purposeCategory: string;
  timeline: TimelineEvent[];
}

export interface ExpensePolicy {
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
  active: boolean;
}

export interface TransactionFilters {
  employeeId: string;
  department: string;
  mcc: string;
  startDate: string;
  endDate: string;
  minAmount: string;
  maxAmount: string;
  upiApp: string;
  status: string;
  search: string;
}

export interface AlertConfig {
  delivery: "email" | "in_app" | "both";
  threshold: "per_violation" | "daily_digest" | "weekly_summary";
  mutedPolicies: string[];
  mutedEmployees: string[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
  twoFactor: boolean;
}

export interface BillingPlan {
  plan: "Basic" | "Pro" | "Enterprise";
  billingCycle: "monthly" | "yearly";
  nextRenewal: string;
  licenses: number;
  headcount: number;
}

export interface ExportAudit {
  id: string;
  actor: string;
  format: "csv" | "pdf";
  dateRange: string;
  exportedAt: string;
  recordCount: number;
}
