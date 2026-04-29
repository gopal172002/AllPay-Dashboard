/** Payload shape from AllpayEmployeeApp (React Native) */
export type MobileMerchant = {
  vpa: string;
  name: string;
  category: string;
  mcc: string;
  amount?: number;
};

export type MobileReceipt = {
  id: string;
  uri: string;
  fileName: string;
  fileSize: number;
  type: string;
};

export type MobileLocation = {
  latitude: number;
  longitude: number;
  capturedAt: string;
} | null;

export type MobileTransactionPayload = {
  id: string;
  employeeId: string;
  merchant: MobileMerchant;
  amount: number;
  timestamp: string;
  upiApp: string;
  upiRefId?: string;
  status: string;
  syncStatus?: string;
  reimbursementPurpose?: string;
  reimbursementNote?: string;
  reimbursementDate?: string;
  reimbursementAmount?: number;
  adminNote?: string;
  rejectionReason?: string;
  policyWarning?: string;
  warningAcknowledged?: boolean;
  receipts?: MobileReceipt[];
  location?: MobileLocation;
};

export function normalizeUpiAppLabel(name: string): string {
  const n = String(name || "").toLowerCase();
  if (n.includes("google") || n === "gpay") return "GPay";
  if (n.includes("phonepe")) return "PhonePe";
  if (n.includes("paytm")) return "Paytm";
  if (n.includes("bhim")) return "BHIM";
  return "GPay";
}

export function mapMobileStatusToDashboard(status: string): string {
  switch (status) {
    case "Recorded":
      return "pending";
    case "Pending Approval":
      return "pending";
    case "Approved":
      return "approved";
    case "Rejected":
      return "rejected";
    case "Flagged":
      return "flagged";
    case "Abandoned":
      return "rejected";
    default:
      return "pending";
  }
}

export function mobileTxToDashboardFields(
  tx: MobileTransactionPayload,
  employeeName: string,
  department: string
): Record<string, unknown> {
  const purpose =
    (tx.reimbursementPurpose && String(tx.reimbursementPurpose).trim()) ||
    tx.merchant.category ||
    "General";

  const upiRef = (tx.upiRefId && String(tx.upiRefId).trim()) || "PENDING";

  return {
    id: tx.id,
    employeeId: tx.employeeId,
    employeeName,
    department,
    merchantName: tx.merchant.name || "Unknown",
    mcc: tx.merchant.mcc || "5999",
    category: tx.merchant.category || "office",
    amount: Number(tx.amount) || 0,
    claimedAmount: Number(tx.reimbursementAmount ?? tx.amount) || 0,
    dateTime: tx.timestamp || new Date().toISOString(),
    status: mapMobileStatusToDashboard(tx.status),
    upiApp: normalizeUpiAppLabel(tx.upiApp),
    upiRefId: upiRef,
    isNewTx: true,
    flags: [],
    hasMatchingAllpayRecord: true,
    purposeCategory: purpose,
    timeline: [],
    merchantVpa: tx.merchant.vpa,
    reimbursementNote: tx.reimbursementNote,
    policyWarning: tx.policyWarning,
    warningAcknowledged: tx.warningAcknowledged ?? false,
    mobileLocation: tx.location ?? null,
    mobileReceipts: Array.isArray(tx.receipts) ? tx.receipts : [],
    lastSyncedFromMobileAt: new Date().toISOString()
  };
}
