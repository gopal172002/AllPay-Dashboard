jest.mock("razorpay", () => {
  let orderCounter = 0;
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: jest.fn().mockImplementation(async () => {
        orderCounter += 1;
        return { id: `order_mock_${orderCounter}` };
      }),
    },
  }));
});

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import crypto from "node:crypto";
import { app } from "../server";
import { seedDatabase } from "../seed";
import { Transaction } from "../models";
import {
  confirmRazorpayPayment,
  createRazorpayOrder,
  handleRazorpayWebhookEvent,
  resetRazorpayClientForTests,
  verifyPaymentSignature,
} from "../services/razorpayService";

const keySecret = "test_secret";
const webhookSecret = "whsec_test";

describe("Razorpay integration", () => {
  let memoryMongo: MongoMemoryServer;

  beforeAll(async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = keySecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    process.env.USE_RAZORPAY_UPI = "true";
    resetRazorpayClientForTests();
    memoryMongo = await MongoMemoryServer.create();
    await mongoose.connect(memoryMongo.getUri());
    await mongoose.connection.db?.dropDatabase();
    await seedDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await memoryMongo.stop();
  });

  it("POST /mobile/payments/create-order creates order for seed employee", async () => {
    const res = await request(app)
      .post("/api/mobile/payments/create-order")
      .send({
        txId: "TXN-RZP-1",
        amount: 250,
        employeeId: "EMP-1000",
        merchant: {
          vpa: "shop@paytm",
          name: "Corner Store",
          category: "food",
          mcc: "5812",
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.orderId).toMatch(/^order_mock_/);

    const tx = await Transaction.findOne({ id: "TXN-RZP-1" }).exec();
    expect(tx?.paymentStatus).toBe("order_created");
  });

  it("returns same order for duplicate create-order with same amount", async () => {
    const payload = {
      txId: "TXN-RZP-DUP",
      amount: 99,
      employeeId: "EMP-1000",
      merchant: { vpa: "a@paytm", name: "A", category: "office", mcc: "5999" },
    };
    const first = await request(app).post("/api/mobile/payments/create-order").send(payload);
    const second = await request(app).post("/api/mobile/payments/create-order").send(payload);
    expect(first.body.orderId).toBe(second.body.orderId);
  });

  it("returns 409 when amount changes for same txId", async () => {
    await request(app)
      .post("/api/mobile/payments/create-order")
      .send({
        txId: "TXN-RZP-409",
        amount: 50,
        employeeId: "EMP-1000",
        merchant: { vpa: "b@paytm", name: "B", category: "office", mcc: "5999" },
      });
    const res = await request(app)
      .post("/api/mobile/payments/create-order")
      .send({
        txId: "TXN-RZP-409",
        amount: 51,
        employeeId: "EMP-1000",
        merchant: { vpa: "b@paytm", name: "B", category: "office", mcc: "5999" },
      });
    expect(res.status).toBe(409);
  });

  it("returns 404 for unknown employee", async () => {
    const res = await request(app)
      .post("/api/mobile/payments/create-order")
      .send({
        txId: "TXN-RZP-NOEMP",
        amount: 10,
        employeeId: "EMP-MISSING",
        merchant: { vpa: "c@paytm", name: "C", category: "office", mcc: "5999" },
      });
    expect(res.status).toBe(404);
  });

  it("verifyPaymentSignature validates HMAC", () => {
    const orderId = "order_abc";
    const paymentId = "pay_xyz";
    const signature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    expect(verifyPaymentSignature(orderId, paymentId, signature, keySecret)).toBe(true);
    expect(verifyPaymentSignature(orderId, paymentId, "bad", keySecret)).toBe(false);
  });

  it("confirm endpoint updates transaction to payment_processing", async () => {
    const order = await createRazorpayOrder({
      txId: "TXN-CONF-1",
      amount: 10,
      employeeId: "EMP-1000",
      employeeName: "Employee 1",
      department: "Engineering",
      merchant: { vpa: "d@paytm", name: "D", category: "office", mcc: "5999" },
    });
    const paymentId = "pay_confirm_1";
    const signature = crypto
      .createHmac("sha256", keySecret)
      .update(`${order.orderId}|${paymentId}`)
      .digest("hex");

    const tx = await confirmRazorpayPayment({
      txId: "TXN-CONF-1",
      razorpay_order_id: order.orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    });
    expect(tx.paymentStatus).toBe("payment_processing");
  });

  it("webhook payment.captured sets payment_captured", async () => {
    const order = await createRazorpayOrder({
      txId: "TXN-WH-1",
      amount: 20,
      employeeId: "EMP-1000",
      employeeName: "Employee 1",
      department: "Engineering",
      merchant: { vpa: "e@paytm", name: "E", category: "office", mcc: "5999" },
    });
    const payload = JSON.stringify({
      event: "payment.captured",
      id: "evt_capture_1",
      payload: {
        payment: {
          entity: {
            id: "pay_webhook_1",
            order_id: order.orderId,
            amount: 2000,
          },
        },
      },
    });
    const signature = crypto.createHmac("sha256", webhookSecret).update(payload).digest("hex");
    const result = await handleRazorpayWebhookEvent(payload, signature, "evt_capture_1");
    expect(result.ok).toBe(true);

    const tx = await Transaction.findOne({ id: "TXN-WH-1" }).exec();
    expect(tx?.paymentStatus).toBe("payment_captured");
  });

  it("duplicate webhook event is idempotent", async () => {
    const order = await createRazorpayOrder({
      txId: "TXN-WH-DUP",
      amount: 20,
      employeeId: "EMP-1000",
      employeeName: "Employee 1",
      department: "Engineering",
      merchant: { vpa: "f@paytm", name: "F", category: "office", mcc: "5999" },
    });
    const payload = JSON.stringify({
      event: "payment.captured",
      id: "evt_capture_dup",
      payload: {
        payment: {
          entity: {
            id: "pay_webhook_dup",
            order_id: order.orderId,
            amount: 2000,
          },
        },
        order: { entity: { receipt: "TXN-WH-DUP" } },
      },
    });
    const signature = crypto.createHmac("sha256", webhookSecret).update(payload).digest("hex");
    const first = await handleRazorpayWebhookEvent(payload, signature, "evt_capture_dup");
    const second = await handleRazorpayWebhookEvent(payload, signature, "evt_capture_dup");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
  });

  it("rejects invalid webhook signature", async () => {
    const res = await request(app)
      .post("/api/webhooks/razorpay")
      .set("x-razorpay-signature", "invalid")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));
    expect(res.status).toBe(400);
  });
});
