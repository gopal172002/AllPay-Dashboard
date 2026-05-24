import { mergeMobileSyncFields, canSubmitReimbursement } from "../services/paymentFieldGuard";
import { mobileTxToDashboardFields, type MobileTransactionPayload } from "../services/mobileTransactionMapper";

describe("paymentFieldGuard", () => {
  it("allows reimbursement only when payment captured", () => {
    expect(canSubmitReimbursement("payment_captured")).toBe(true);
    expect(canSubmitReimbursement("legacy_simulated")).toBe(true);
    expect(canSubmitReimbursement("order_created")).toBe(false);
  });

  it("preserves server payment fields on sync merge", () => {
    const existing = {
      paymentStatus: "payment_captured",
      razorpayPaymentId: "pay_server",
      upiRefId: "pay_server",
      hasMatchingAllpayRecord: true,
    } as import("../models").ITransaction;

    const incoming = mobileTxToDashboardFields(
      {
        id: "TXN-1",
        employeeId: "EMP-1",
        merchant: { vpa: "m@paytm", name: "M", category: "food", mcc: "5812" },
        amount: 100,
        timestamp: new Date().toISOString(),
        upiApp: "GPay",
        status: "Recorded",
        paymentStatus: "order_created",
        razorpayPaymentId: "pay_client_fake",
      } as MobileTransactionPayload,
      "Emp",
      "Dept"
    );

    const merged = mergeMobileSyncFields(existing, incoming);
    expect(merged.paymentStatus).toBeUndefined();
    expect(merged.razorpayPaymentId).toBeUndefined();
    expect(merged.upiRefId).toBe("pay_server");
  });
});
