import type {
  AdminUser,
  AlertConfig,
  BillingPlan,
  Employee,
  ExpensePolicy,
  ExportAudit,
  Transaction,
} from "../types";

interface BootstrapPayload {
  transactions: Transaction[];
  employees: Employee[];
  policies: ExpensePolicy[];
  alertsConfig: AlertConfig;
  admins: AdminUser[];
  billing: BillingPlan;
  exportAudits: ExportAudit[];
}

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

export const adminApi = {
  async bootstrap(): Promise<BootstrapPayload> {
    return request<BootstrapPayload>("/admin/bootstrap");
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
    return request("/admin/employees/import", { method: "POST", body: JSON.stringify({ csvText }) });
  },

  async inviteEmployee(email: string, department: string) {
    return request("/admin/employees/invite", { method: "POST", body: JSON.stringify({ email, department }) });
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
