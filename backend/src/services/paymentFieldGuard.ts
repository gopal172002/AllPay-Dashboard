import type { ITransaction } from "../models";
import { isPaymentCaptured, type PaymentStatus } from "./razorpayConfig";

/** Payment fields the server owns — mobile sync must not overwrite. */
export const SERVER_OWNED_PAYMENT_FIELDS = [
  "paymentStatus",
  "razorpayOrderId",
  "razorpayPaymentId",
  "orderAmountPaise",
  "capturedAmountPaise",
  "paymentMethod",
  "paymentFailedReason",
  "paymentConfirmedAt",
  "razorpayWebhookEventIds",
] as const;

export function stripServerOwnedPaymentFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...fields };
  for (const key of SERVER_OWNED_PAYMENT_FIELDS) {
    delete next[key];
  }
  return next;
}

export function mergeMobileSyncFields(
  existing: ITransaction,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const safe = stripServerOwnedPaymentFields(incoming);

  if (existing.paymentStatus === "payment_captured") {
    safe.hasMatchingAllpayRecord = existing.hasMatchingAllpayRecord;
    safe.upiRefId = existing.upiRefId;
  }

  return safe;
}

export function canSubmitReimbursement(paymentStatus: PaymentStatus | undefined): boolean {
  return isPaymentCaptured(paymentStatus);
}

export function reimbursementBlockedMessage(paymentStatus: PaymentStatus | undefined): string {
  if (canSubmitReimbursement(paymentStatus)) {
    return "";
  }
  return "Payment must be captured before submitting for reimbursement";
}
