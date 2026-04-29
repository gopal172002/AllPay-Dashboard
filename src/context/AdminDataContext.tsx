import dayjs from "dayjs";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { adminApi } from "../api/adminApi";
import type { AdminUser, AlertConfig, BillingPlan, Employee, ExpensePolicy, ExportAudit, Transaction, TransactionFilters } from "../types";

const FILTER_KEY = "admin-dashboard-filters";

const defaultFilters: TransactionFilters = {
  employeeId: "",
  department: "",
  mcc: "",
  startDate: "",
  endDate: "",
  minAmount: "",
  maxAmount: "",
  upiApp: "",
  status: "",
  search: "",
};

interface AdminDataContextShape {
  isBootstrapping: boolean;
  isSaving: boolean;
  errorMessage: string;
  transactions: Transaction[];
  filteredTransactions: Transaction[];
  filters: TransactionFilters;
  employees: Employee[];
  policies: ExpensePolicy[];
  alertsConfig: AlertConfig;
  admins: AdminUser[];
  billing: BillingPlan;
  exportAudits: ExportAudit[];
  dashboardLoadMs: number;
  flaggedOnly: boolean;
  setFlaggedOnly: (value: boolean) => void;
  setFilters: (next: Partial<TransactionFilters>) => void;
  resetFilters: () => void;
  approveTransaction: (id: string, amount: number) => Promise<void>;
  rejectTransaction: (id: string, reason: string) => Promise<void>;
  bulkDecision: (ids: string[], decision: "approved" | "rejected", reason?: string) => Promise<void>;
  createPolicy: (policy: ExpensePolicy) => Promise<{ matchedCount: number }>;
  previewPolicy: (policy: ExpensePolicy) => Transaction[];
  addEmployeesFromCsv: (text: string) => Promise<number>;
  inviteEmployee: (email: string, department: string) => Promise<void>;
  manageDepartment: (mode: "create" | "rename" | "delete", value: string, next?: string) => void;
  updateAlertConfig: (next: Partial<AlertConfig>) => Promise<void>;
  updateBillingPlan: (plan: BillingPlan["plan"]) => Promise<void>;
  upsertAdmin: (admin: AdminUser) => Promise<void>;
  toggleAdminActive: (id: string) => Promise<void>;
  recordExport: (format: "csv" | "pdf", dateRange: string, recordCount: number) => Promise<void>;
  uploadReceipt: (transactionId: string, file: File) => Promise<void>;
}

const AdminDataContext = createContext<AdminDataContextShape | undefined>(undefined);

export const AdminDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [policies, setPolicies] = useState<ExpensePolicy[]>([]);
  const [alertsConfig, setAlertsConfig] = useState<AlertConfig>({ delivery: "both", threshold: "daily_digest", mutedPolicies: [], mutedEmployees: [] });
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [billing, setBilling] = useState<BillingPlan>({ plan: "Basic", billingCycle: "monthly", nextRenewal: dayjs().add(1, "month").format("YYYY-MM-DD"), licenses: 0, headcount: 0 });
  const [exportAudits, setExportAudits] = useState<ExportAudit[]>([]);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [dashboardLoadMs] = useState(900);
  const [filters, setLocalFilters] = useState<TransactionFilters>(() => {
    const stored = localStorage.getItem(FILTER_KEY);
    if (!stored) return defaultFilters;
    try {
      return { ...defaultFilters, ...(JSON.parse(stored) as TransactionFilters) };
    } catch {
      return defaultFilters;
    }
  });

  useEffect(() => {
    adminApi
      .bootstrap({ page: 1, limit: 350 })
      .then((payload) => {
        setTransactions(payload.transactions);
        setEmployees(payload.employees);
        setPolicies(payload.policies);
        setAlertsConfig(payload.alertsConfig);
        setAdmins(payload.admins);
        setBilling(payload.billing);
      })
      .catch((error) => {
        setErrorMessage((error as Error).message);
      })
      .finally(() => {
        setIsBootstrapping(false);
      });
  }, []);

  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
  }, [filters]);



  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (flaggedOnly && tx.status !== "flagged") return false;
      if (filters.employeeId && tx.employeeId !== filters.employeeId) return false;
      if (filters.department && tx.department !== filters.department) return false;
      if (filters.mcc && tx.category !== filters.mcc) return false;
      if (filters.upiApp && tx.upiApp !== filters.upiApp) return false;
      if (filters.status && tx.status !== filters.status) return false;
      if (filters.startDate && dayjs(tx.dateTime).isBefore(dayjs(filters.startDate), "day")) return false;
      if (filters.endDate && dayjs(tx.dateTime).isAfter(dayjs(filters.endDate).endOf("day"))) return false;
      if (filters.minAmount && tx.amount < Number(filters.minAmount)) return false;
      if (filters.maxAmount && tx.amount > Number(filters.maxAmount)) return false;

      if (filters.search) {
        const q = filters.search.toLowerCase();
        const combined = `${tx.employeeName} ${tx.merchantName} ${tx.upiRefId}`.toLowerCase();
        if (!combined.includes(q)) return false;
      }

      return true;
    });
  }, [filters, flaggedOnly, transactions]);

  const setFilters = (next: Partial<TransactionFilters>) => {
    setLocalFilters((prev) => ({ ...prev, ...next }));
  };

  const resetFilters = () => {
    setLocalFilters(defaultFilters);
    setFlaggedOnly(false);
  };

  const withSaving = async (task: () => Promise<void>) => {
    setErrorMessage("");
    setIsSaving(true);
    try {
      await task();
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const approveTransaction = async (id: string, amount: number) => {
    await withSaving(async () => {
      await adminApi.approveTransaction(id, amount);
    });
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === id
          ? {
              ...tx,
              status: "approved",
              claimedAmount: amount,
              adminDecision: amount === tx.amount ? "Approved in full" : `Partial approval Rs.${amount}`,
              adminDecisionAt: dayjs().toISOString(),
              timeline: [
                ...tx.timeline,
                { id: `${id}-review`, actor: "Finance Admin", action: "Admin reviewed", timestamp: dayjs().toISOString() },
                { id: `${id}-approve`, actor: "Finance Admin", action: `Approved Rs.${amount}`, timestamp: dayjs().toISOString() },
              ],
            }
          : tx,
      ),
    );
  };

  const rejectTransaction = async (id: string, reason: string) => {
    await withSaving(async () => {
      await adminApi.rejectTransaction(id, reason);
    });
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === id
          ? {
              ...tx,
              status: "rejected",
              adminDecision: `Rejected - ${reason}`,
              adminDecisionAt: dayjs().toISOString(),
              timeline: [
                ...tx.timeline,
                { id: `${id}-review`, actor: "Finance Admin", action: "Admin reviewed", timestamp: dayjs().toISOString() },
                { id: `${id}-reject`, actor: "Finance Admin", action: `Rejected (${reason})`, timestamp: dayjs().toISOString() },
              ],
            }
          : tx,
      ),
    );
  };

  const bulkDecision = async (ids: string[], decision: "approved" | "rejected", reason?: string) => {
    await withSaving(async () => {
      await adminApi.bulkDecision(ids, decision, reason);
    });
    setTransactions((prev) =>
      prev.map((tx) => {
        if (!ids.includes(tx.id)) return tx;
        if (decision === "approved") {
          return {
            ...tx,
            status: "approved",
            adminDecision: "Bulk approved",
            adminDecisionAt: dayjs().toISOString(),
            timeline: [
              ...tx.timeline,
              { id: `${tx.id}-bulk`, actor: "Finance Admin", action: "Bulk approved", timestamp: dayjs().toISOString() },
            ],
          };
        }
        return {
          ...tx,
          status: "rejected",
          adminDecision: `Bulk rejected - ${reason || "Policy violation"}`,
          adminDecisionAt: dayjs().toISOString(),
          timeline: [
            ...tx.timeline,
            { id: `${tx.id}-bulk`, actor: "Finance Admin", action: "Bulk rejected", timestamp: dayjs().toISOString() },
          ],
        };
      }),
    );
  };

  const previewPolicy = (policy: ExpensePolicy) => {
    return transactions.filter((tx) => {
      const inScope =
        policy.scopeType === "all" ||
        (policy.scopeType === "department" && tx.department === policy.scopeValue) ||
        (policy.scopeType === "employee" && tx.employeeId === policy.scopeValue);
      if (!inScope) return false;
      if (policy.mccCategory && tx.category !== policy.mccCategory) return false;
      if (policy.maxPerTransaction && tx.amount > policy.maxPerTransaction) return true;
      const day = dayjs(tx.dateTime).day();
      if (policy.allowedDays.length && !policy.allowedDays.includes(day)) return true;
      return false;
    });
  };

  const createPolicy = async (policy: ExpensePolicy) => {
    await withSaving(async () => {
      await adminApi.createPolicy(policy);
    });
    const preview = previewPolicy(policy);
    setPolicies((prev) => [{ ...policy, active: true }, ...prev]);
    return { matchedCount: preview.length };
  };

  const addEmployeesFromCsv = async (text: string) => {
    let n = 0;
    await withSaving(async () => {
      const result = await adminApi.importEmployees(text);
      n = result.createdCount;
      const added = (result.created as Employee[]).map((e) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        department: e.department,
        role: (e.role === "manager" ? "manager" : "employee") as "employee" | "manager",
        active: e.active !== false,
        onboarded: e.onboarded ?? false,
        travelApproved: e.travelApproved ?? false,
      }));
      if (added.length) {
        setEmployees((prev) => [...added, ...prev]);
        setBilling((prev) => ({ ...prev, headcount: prev.headcount + added.length }));
      }
    });
    return n;
  };

  const inviteEmployee = async (email: string, department: string) => {
    await withSaving(async () => {
      const { employee } = await adminApi.inviteEmployee(email, department);
      setEmployees((prev) => [employee, ...prev]);
      setBilling((prev) => ({ ...prev, headcount: prev.headcount + 1 }));
    });
  };

  const manageDepartment = (mode: "create" | "rename" | "delete", value: string, next?: string) => {
    if (mode === "rename" && next) {
      setEmployees((prev) => prev.map((emp) => (emp.department === value ? { ...emp, department: next } : emp)));
    }
    if (mode === "delete") {
      setEmployees((prev) => prev.map((emp) => (emp.department === value ? { ...emp, department: "Unassigned" } : emp)));
    }
  };

  const updateAlertConfig = async (next: Partial<AlertConfig>) => {
    await withSaving(async () => {
      await adminApi.updateAlerts(next);
    });
    setAlertsConfig((prev) => ({ ...prev, ...next }));
  };

  const updateBillingPlan = async (plan: BillingPlan["plan"]) => {
    await withSaving(async () => {
      await adminApi.updateBillingPlan(plan);
    });
    setBilling((prev) => ({ ...prev, plan }));
  };

  const upsertAdmin = async (admin: AdminUser) => {
    await withSaving(async () => {
      await adminApi.upsertAdmin(admin);
    });
    setAdmins((prev) => {
      const exists = prev.some((item) => item.id === admin.id);
      if (exists) return prev.map((item) => (item.id === admin.id ? admin : item));
      return [admin, ...prev];
    });
  };

  const toggleAdminActive = async (id: string) => {
    await withSaving(async () => {
      await adminApi.toggleAdmin(id);
    });
    setAdmins((prev) => prev.map((admin) => (admin.id === id ? { ...admin, active: !admin.active } : admin)));
  };

  const recordExport = async (format: "csv" | "pdf", dateRange: string, recordCount: number) => {
    await withSaving(async () => {
      await adminApi.recordExport({ format, dateRange, recordCount });
    });
    setExportAudits((prev) => [
      {
        id: `EXP-${Date.now()}`,
        actor: "Finance Admin",
        format,
        dateRange,
        exportedAt: dayjs().toISOString(),
        recordCount,
      },
      ...prev,
    ]);
  };

  const uploadReceipt = async (transactionId: string, file: File) => {
    await withSaving(async () => {
      const result = await adminApi.uploadReceipt(transactionId, file);
      setTransactions((prev) =>
        prev.map((tx) => (tx.id === transactionId ? { ...tx, receiptUrl: result.receiptUrl } : tx))
      );
    });
  };

  const value: AdminDataContextShape = {
    isBootstrapping,
    isSaving,
    errorMessage,
    transactions,
    filteredTransactions,
    filters,
    employees,
    policies,
    alertsConfig,
    admins,
    billing,
    exportAudits,
    dashboardLoadMs,
    flaggedOnly,
    setFlaggedOnly,
    setFilters,
    resetFilters,
    approveTransaction,
    rejectTransaction,
    bulkDecision,
    createPolicy,
    previewPolicy,
    addEmployeesFromCsv,
    inviteEmployee,
    manageDepartment,
    updateAlertConfig,
    updateBillingPlan,
    upsertAdmin,
    toggleAdminActive,
    recordExport,
    uploadReceipt,
  };

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAdminData = () => {
  const context = useContext(AdminDataContext);
  if (!context) throw new Error("useAdminData must be used within AdminDataProvider");
  return context;
};
