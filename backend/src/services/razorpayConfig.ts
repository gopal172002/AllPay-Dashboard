export const PAYMENT_STATUSES = [
  "draft",
  "order_created",
  "checkout_opened",
  "payment_processing",
  "payment_captured",
  "payment_failed",
  "payment_abandoned",
  "legacy_simulated",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const TERMINAL_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  "payment_captured",
  "payment_failed",
  "payment_abandoned",
  "legacy_simulated",
]);

export function isValidPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function assertValidPaymentStatus(value: string): PaymentStatus {
  if (!isValidPaymentStatus(value)) {
    throw new Error(`Invalid paymentStatus: ${value}`);
  }
  return value;
}

export function isTerminalPaymentStatus(status: PaymentStatus | undefined): boolean {
  return status !== undefined && TERMINAL_PAYMENT_STATUSES.has(status);
}

export function isPaymentCaptured(status: PaymentStatus | undefined): boolean {
  return status === "payment_captured" || status === "legacy_simulated";
}

export type RazorpayRuntimeConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  useRazorpayUpi: boolean;
  isProduction: boolean;
};

export function loadRazorpayConfig(): RazorpayRuntimeConfig {
  const isProduction = process.env.NODE_ENV === "production";
  const useRazorpayUpi = process.env.USE_RAZORPAY_UPI === "true" || process.env.USE_RAZORPAY_UPI === "1";
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "";

  if (isProduction && useRazorpayUpi) {
    if (!keyId || !keySecret || !webhookSecret) {
      throw new Error(
        "Razorpay is enabled but RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET must be set in production"
      );
    }
  }

  return { keyId, keySecret, webhookSecret, useRazorpayUpi, isProduction };
}

export function requireRazorpaySecrets(config: RazorpayRuntimeConfig): void {
  if (!config.keyId || !config.keySecret) {
    throw new Error("Razorpay API credentials are not configured");
  }
}
