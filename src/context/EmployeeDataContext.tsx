import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { employeeApi } from "../api/employeeApi";
import type { Employee, EmployeeDashboardSummary, PaymentProof, Transaction } from "../types";

interface EmployeeDataContextShape {
  employee: Employee | null;
  transactions: Transaction[];
  paymentProofs: PaymentProof[];
  summary: EmployeeDashboardSummary | null;
  isBootstrapping: boolean;
  errorMessage: string;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  filteredTransactions: Transaction[];
  refresh: () => Promise<void>;
  submitPaymentProof: (form: FormData) => Promise<void>;
  uploadReceipt: (transactionId: string, file: File) => Promise<void>;
}

const EmployeeDataContext = createContext<EmployeeDataContextShape | undefined>(undefined);

export const EmployeeDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [paymentProofs, setPaymentProofs] = useState<PaymentProof[]>([]);
  const [summary, setSummary] = useState<EmployeeDashboardSummary | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setIsBootstrapping(true);
    setErrorMessage("");
    try {
      const data = await employeeApi.bootstrap();
      setEmployee(data.employee);
      setTransactions(data.transactions);
      setPaymentProofs(data.paymentProofs);
      setSummary(data.summary);
    } catch (e) {
      setErrorMessage((e as Error).message);
    } finally {
      setIsBootstrapping(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (statusFilter && tx.status !== statusFilter) return false;
      if (!q) return true;
      const blob = `${tx.merchantName} ${tx.upiRefId} ${tx.id}`.toLowerCase();
      return blob.includes(q);
    });
  }, [transactions, statusFilter, search]);

  const submitPaymentProof = useCallback(async (form: FormData) => {
    const res = await employeeApi.submitPaymentProof(form);
    setPaymentProofs((prev) => [res.paymentProof, ...prev]);
    setTransactions((prev) => [res.transaction, ...prev]);
  }, []);

  const uploadReceipt = useCallback(
    async (transactionId: string, file: File) => {
      const res = await employeeApi.uploadReceipt(transactionId, file);
      setTransactions((prev) =>
        prev.map((tx) => (tx.id === transactionId ? { ...tx, receiptUrl: res.receiptUrl } : tx))
      );
    },
    []
  );

  const value = useMemo(
    () => ({
      employee,
      transactions,
      paymentProofs,
      summary,
      isBootstrapping,
      errorMessage,
      statusFilter,
      setStatusFilter,
      search,
      setSearch,
      filteredTransactions,
      refresh: load,
      submitPaymentProof,
      uploadReceipt,
    }),
    [
      employee,
      transactions,
      paymentProofs,
      summary,
      isBootstrapping,
      errorMessage,
      statusFilter,
      search,
      filteredTransactions,
      load,
      submitPaymentProof,
      uploadReceipt,
    ]
  );

  return <EmployeeDataContext.Provider value={value}>{children}</EmployeeDataContext.Provider>;
};

export function useEmployeeData() {
  const ctx = useContext(EmployeeDataContext);
  if (!ctx) throw new Error("useEmployeeData must be used within EmployeeDataProvider");
  return ctx;
}
