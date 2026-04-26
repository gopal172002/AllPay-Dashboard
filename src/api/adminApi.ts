import type {
  AdminUser,
  AlertConfig,
  BillingPlan,
  Employee,
  ExpensePolicy,
  ExportAudit,
  Transaction,
} from "../types";

export interface BootstrapPayload {
  transactions: Transaction[];
  employees: Employee[];
  policies: ExpensePolicy[];
  alertsConfig: AlertConfig;
  admins: AdminUser[];
  billing: BillingPlan;
  exportAudits: ExportAudit[];
  transactionPage?: number;
  transactionPageSize?: number;
  transactionTotal?: number;
  hasMoreTransactions?: boolean;
}

export type TransactionsListResponse = {
  transactions: Transaction[];
  transactionPage: number;
  transactionPageSize: number;
  transactionTotal: number;
  hasMoreTransactions: boolean;
};

export type DailySpendResponse = {
  date: string;
  totalSpend: number;
  transactionCount: number;
  byCategory: { category: string; total: number; count: number }[];
};

export type AggregatedAnalyticsResponse = {
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

export type PolicyPreviewResponse = {
  ok: boolean;
  wouldFlagCount: number;
  affectedEmployeeCount: number;
  affectedEmployeeIds: string[];
  estimatedSavingsIfRejected: number;
  matches: Array<{
    transactionId: string;
    reasons: string[];
    amount: number;
    employeeId: string;
    employeeName: string;
    category: string;
  }>;
  hasMore: boolean;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const request = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const token = localStorage.getItem("allpay_token");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...init,
  });
  
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return (await res.json()) as T;
};

function toQueryString(params?: Record<string, string | number | boolean | undefined>) {
  if (!params) return "";
  const e = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    e.set(k, String(v));
  }
  const s = e.toString();
  return s ? `?${s}` : "";
}

export const adminApi = {
  async bootstrap(params?: Record<string, string | number | boolean | undefined>): Promise<BootstrapPayload> {
    return request<BootstrapPayload>(`/admin/bootstrap${toQueryString(params)}`);
  },

  async getTransactions(
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<TransactionsListResponse> {
    return request<TransactionsListResponse>(`/admin/transactions${toQueryString(params)}`);
  },

  async getDailySpend(dateYmd?: string): Promise<DailySpendResponse> {
    return request<DailySpendResponse>(
      `/admin/analytics/daily-spend${toQueryString(dateYmd ? { date: dateYmd } : undefined)}`
    );
  },

  async getAnalyticsAggregated(params?: {
    startDate?: string;
    endDate?: string;
    timelineBucket?: "daily" | "weekly" | "monthly";
  }): Promise<AggregatedAnalyticsResponse> {
    return request<AggregatedAnalyticsResponse>(`/admin/analytics/aggregated${toQueryString(params)}`);
  },

  async previewPolicy(policy: ExpensePolicy): Promise<PolicyPreviewResponse> {
    return request<PolicyPreviewResponse>("/admin/policies/preview", {
      method: "POST",
      body: JSON.stringify(policy),
    });
  },

  async approveTransaction(transactionId: string, amount: number) {
    return request("/admin/transactions/approve", {
      method: "POST",
      body: JSON.stringify({ transactionId, amount }),
    });
  },

  async rejectTransaction(transactionId: string, reason: string) {
    return request("/admin/transactions/reject", {
      method: "POST",
      body: JSON.stringify({ transactionId, reason }),
    });
  },

  async bulkDecision(ids: string[], decision: "approved" | "rejected", reason?: string) {
    return request("/admin/transactions/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, decision, reason }),
    });
  },

  async createPolicy(policy: ExpensePolicy) {
    return request("/admin/policies", { method: "POST", body: JSON.stringify(policy) });
  },

  async importEmployees(csvText: string) {
    return request<{
      ok: boolean;
      created: Employee[];
      createdCount: number;
      skipped: number;
      errors: string[];
    }>("/admin/employees/import", { method: "POST", body: JSON.stringify({ csvText }) });
  },

  async inviteEmployee(email: string, department: string, name?: string) {
    return request<{ ok: boolean; employee: Employee }>("/admin/employees/invite", {
      method: "POST",
      body: JSON.stringify({ email, department, ...(name ? { name } : {}) }),
    });
  },

  async updateAlerts(config: Partial<AlertConfig>) {
    return request("/admin/alerts", { method: "PATCH", body: JSON.stringify(config) });
  },

  async updateBillingPlan(plan: BillingPlan["plan"]) {
    return request("/admin/billing", { method: "PATCH", body: JSON.stringify({ plan }) });
  },

  async upsertAdmin(admin: AdminUser) {
    return request("/admin/users", { method: "PUT", body: JSON.stringify(admin) });
  },

  async toggleAdmin(id: string) {
    return request(`/admin/users/${id}/toggle`, { method: "POST" });
  },

  async recordExport(payload: { format: "csv" | "pdf"; dateRange: string; recordCount: number }) {
    return request("/admin/exports", { method: "POST", body: JSON.stringify(payload) });
  },

  async uploadReceipt(
    transactionId: string,
    file: File
  ): Promise<{ ok: boolean; transactionId: string; receiptUrl: string }> {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
    const token = localStorage.getItem("allpay_token");
    const form = new FormData();
    form.append("receipt", file);
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}/admin/transactions/${encodeURIComponent(transactionId)}/receipt`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    return (await res.json()) as { ok: boolean; transactionId: string; receiptUrl: string };
  },
};
