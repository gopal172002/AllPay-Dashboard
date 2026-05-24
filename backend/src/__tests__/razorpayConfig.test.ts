import { Transaction } from "../models";
import {
  assertValidPaymentStatus,
  isValidPaymentStatus,
  loadRazorpayConfig,
} from "../services/razorpayConfig";

describe("razorpayConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "test" };
    delete process.env.USE_RAZORPAY_UPI;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("accepts known payment statuses", () => {
    expect(isValidPaymentStatus("payment_captured")).toBe(true);
    expect(assertValidPaymentStatus("order_created")).toBe("order_created");
  });

  it("rejects unknown payment statuses", () => {
    expect(isValidPaymentStatus("paid")).toBe(false);
    expect(() => assertValidPaymentStatus("paid")).toThrow(/Invalid paymentStatus/);
  });

  it("loads config without secrets in test mode", () => {
    const config = loadRazorpayConfig();
    expect(config.useRazorpayUpi).toBe(false);
    expect(config.keyId).toBe("");
  });

  it("throws in production when Razorpay enabled without secrets", () => {
    process.env.NODE_ENV = "production";
    process.env.USE_RAZORPAY_UPI = "true";
    expect(() => loadRazorpayConfig()).toThrow(/must be set in production/);
  });
});

describe("Transaction payment schema", () => {
  it("persists Razorpay payment lifecycle fields", async () => {
    const doc = new Transaction({
      id: "TXN-SCHEMA-1",
      employeeId: "EMP-1000",
      employeeName: "Employee 1",
      department: "Engineering",
      merchantName: "Test Merchant",
      mcc: "5411",
      category: "food",
      amount: 100,
      claimedAmount: 100,
      dateTime: new Date().toISOString(),
      status: "pending",
      upiApp: "Razorpay",
      upiRefId: "pay_test123",
      purposeCategory: "food",
      paymentStatus: "payment_captured",
      razorpayOrderId: "order_test",
      razorpayPaymentId: "pay_test123",
      orderAmountPaise: 10000,
      capturedAmountPaise: 10000,
      paymentMethod: "razorpay_upi",
      paymentConfirmedAt: new Date().toISOString(),
      razorpayWebhookEventIds: ["evt_1"],
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});
