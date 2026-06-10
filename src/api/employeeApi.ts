import type { Employee, EmployeeDashboardSummary, PaymentProof, Transaction } from "../types";
import type { AggregatedAnalyticsResponse, DailySpendResponse } from "./adminApi";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

/** Never expose AI receipt detection wording to employees in the portal. */
function sanitizeEmployeeFacingError(message: string): string {
  if (/appears ai-generated|ai-generated|ai generated|ai likelihood/i.test(message)) {
    return "Submission failed. Please try again.";
  }
  return message;
}

const request = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const token = localStorage.getItem("allpay_token");
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (!(init?.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const contentType = res.headers.get("content-type") || "";
  let data: Record<string, unknown>;
  if (contentType.includes("application/json")) {
    data = (await res.json()) as Record<string, unknown>;
  } else {
    const text = await res.text();
    if (/entity too large|payload too large/i.test(text)) {
      throw new Error("Image is too large. Please use a file under 10 MB.");
    }
    throw new Error(
      res.status === 404
        ? "API route not found. Restart the backend (cd backend && npm run dev)."
        : `Server returned an unexpected response (${res.status}). Restart the backend and try again.`
    );
  }
  if (!res.ok) {
    throw new Error(
      sanitizeEmployeeFacingError(String(data.error || data.message || "Request failed"))
    );
  }
  return data as T;
};

export interface EmployeeSpendResponse {
  rangeDays: number;
  rangeLabel: string;
  dateRange: { start: string; end: string };
  approvedInRange: number;
  pendingInRange: number;
  transactionCount: number;
  byCategory: { category: string; total: number }[];
}

export interface EmployeeBootstrapPayload {
  transactions: Transaction[];
  employee: Employee;
  summary: EmployeeDashboardSummary;
  spendSummary?: EmployeeSpendResponse;
  paymentProofs: PaymentProof[];
  transactionPage?: number;
  transactionPageSize?: number;
  transactionTotal?: number;
  hasMoreTransactions?: boolean;
}

export const employeeApi = {
  bootstrap: () => request<EmployeeBootstrapPayload>("/employee/bootstrap"),

  getTransactions: (params: URLSearchParams) =>
    request<{
      transactions: Transaction[];
      transactionTotal: number;
    }>(`/employee/transactions?${params.toString()}`),

  getTransaction: (id: string) =>
    request<{ transaction: Transaction }>(`/employee/transactions/${id}`),

  getSpend: (rangeDays = 30) =>
    request<EmployeeSpendResponse>(`/employee/spend?rangeDays=${rangeDays}`),

  getAggregated: (startDate?: string, endDate?: string, timelineBucket = "daily") => {
    const q = new URLSearchParams();
    if (startDate) q.set("startDate", startDate);
    if (endDate) q.set("endDate", endDate);
    q.set("timelineBucket", timelineBucket);
    return request<AggregatedAnalyticsResponse>(`/employee/analytics/aggregated?${q}`);
  },

  getDailySpend: (date?: string) => {
    const q = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<DailySpendResponse>(`/employee/analytics/daily-spend${q}`);
  },

  getPaymentProofs: () =>
    request<{ paymentProofs: PaymentProof[] }>("/employee/payment-proofs"),

  submitPaymentProof: (form: FormData) =>
    request<{ ok: boolean; paymentProof: PaymentProof; transaction: Transaction }>(
      "/employee/payment-proofs",
      { method: "POST", body: form }
    ),

  uploadReceipt: (transactionId: string, file: File) => {
    const fd = new FormData();
    fd.append("receipt", file);
    return request<{ ok: boolean; receiptUrl: string }>(
      `/employee/transactions/${transactionId}/receipt`,
      { method: "POST", body: fd }
    );
  },

  updateProfile: (body: { name?: string; department?: string }) =>
    request<{ ok: boolean; employee: Employee }>("/employee/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
