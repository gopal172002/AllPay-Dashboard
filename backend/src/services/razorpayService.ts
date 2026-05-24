import crypto from "node:crypto";
import Razorpay from "razorpay";
import dayjs from "dayjs";
import { ITransaction, ProcessedWebhookEvent, Transaction } from "../models";
import {
  assertValidPaymentStatus,
  loadRazorpayConfig,
  requireRazorpaySecrets,
  type PaymentStatus,
} from "./razorpayConfig";

export type CreateOrderInput = {
  txId: string;
  amount: number;
  employeeId: string;
  employeeName: string;
  department: string;
  merchant: {
    vpa: string;
    name: string;
    category: string;
    mcc: string;
    amount?: number;
  };
  upiApp?: string;
};

export type CreateOrderResult = {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  txId: string;
};

export type ConfirmPaymentInput = {
  txId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

let razorpayClient: Razorpay | null = null;

export function resetRazorpayClientForTests(): void {
  razorpayClient = null;
}

export function getRazorpayClient(): Razorpay {
  if (razorpayClient) {
    return razorpayClient;
  }
  const config = loadRazorpayConfig();
  requireRazorpaySecrets(config);
  razorpayClient = new Razorpay({
    key_id: config.keyId,
    key_secret: config.keySecret,
  });
  return razorpayClient;
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret?: string
): boolean {
  const secret = keySecret ?? loadRazorpayConfig().keySecret;
  if (!secret) {
    return false;
  }
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

export function verifyWebhookSignature(body: string, signature: string, webhookSecret?: string): boolean {
  const secret = webhookSecret ?? loadRazorpayConfig().webhookSecret;
  if (!secret) {
    return false;
  }
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

function appendTimeline(tx: ITransaction, action: string, actor = "Razorpay"): void {
  tx.timeline.push({
    id: `rzp-${Date.now().toString(36)}`,
    actor,
    action,
    timestamp: dayjs().toISOString(),
  });
}

function amountToPaise(amount: number): number {
  return Math.round(amount * 100);
}

export async function createRazorpayOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const config = loadRazorpayConfig();
  requireRazorpaySecrets(config);

  if (input.merchant.amount !== undefined && input.merchant.amount > 0) {
    const qrPaise = amountToPaise(input.merchant.amount);
    const reqPaise = amountToPaise(input.amount);
    if (qrPaise !== reqPaise) {
      throw new Error("Amount must match the QR code amount");
    }
  }

  const amountPaise = amountToPaise(input.amount);
  if (amountPaise <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const existing = await Transaction.findOne({ id: input.txId }).exec();
  if (existing?.razorpayOrderId && existing.orderAmountPaise === amountPaise) {
    return {
      orderId: existing.razorpayOrderId,
      amount: amountPaise,
      currency: "INR",
      keyId: config.keyId,
      txId: input.txId,
    };
  }
  if (existing?.razorpayOrderId && existing.orderAmountPaise !== amountPaise) {
    const err = new Error("Transaction amount changed; create a new transaction id");
    (err as Error & { statusCode?: number }).statusCode = 409;
    throw err;
  }

  const client = getRazorpayClient();
  const order = await client.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: input.txId,
    notes: {
      employeeId: input.employeeId,
      merchantVpa: input.merchant.vpa,
      merchantName: input.merchant.name,
    },
  });

  const orderId = String(order.id);
  const fields = {
    id: input.txId,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    department: input.department,
    merchantName: input.merchant.name || "Unknown",
    mcc: input.merchant.mcc || "5999",
    category: input.merchant.category || "office",
    amount: input.amount,
    claimedAmount: input.amount,
    dateTime: dayjs().toISOString(),
    status: "pending",
    upiApp: input.upiApp ?? "Razorpay",
    upiRefId: "PENDING",
    isNewTx: true,
    flags: [],
    hasMatchingAllpayRecord: false,
    purposeCategory: input.merchant.category || "General",
    merchantVpa: input.merchant.vpa,
    paymentStatus: "order_created" as PaymentStatus,
    razorpayOrderId: orderId,
    orderAmountPaise: amountPaise,
    paymentMethod: "razorpay_upi",
  };

  if (existing) {
    Object.assign(existing, fields);
    appendTimeline(existing, "Razorpay order created");
    await existing.save();
  } else {
    const created = new Transaction({
      ...fields,
      timeline: [
        {
          id: `rzp-${Date.now().toString(36)}`,
          actor: "Razorpay",
          action: "Razorpay order created",
          timestamp: dayjs().toISOString(),
        },
      ],
    });
    await created.save();
  }

  return {
    orderId,
    amount: amountPaise,
    currency: "INR",
    keyId: config.keyId,
    txId: input.txId,
  };
}

export async function confirmRazorpayPayment(input: ConfirmPaymentInput): Promise<ITransaction> {
  const config = loadRazorpayConfig();
  requireRazorpaySecrets(config);

  const tx = await Transaction.findOne({ id: input.txId }).exec();
  if (!tx) {
    const err = new Error("Transaction not found");
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }
  if (tx.razorpayOrderId !== input.razorpay_order_id) {
    const err = new Error("Order id does not match transaction");
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const valid = verifyPaymentSignature(
    input.razorpay_order_id,
    input.razorpay_payment_id,
    input.razorpay_signature,
    config.keySecret
  );
  if (!valid) {
    const err = new Error("Invalid payment signature");
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }

  if (tx.paymentStatus !== "payment_captured") {
    tx.paymentStatus = "payment_processing";
    tx.razorpayPaymentId = input.razorpay_payment_id;
    tx.upiRefId = input.razorpay_payment_id;
    appendTimeline(tx, "Payment confirmed via SDK (awaiting webhook)");
    await tx.save();
  }

  return tx;
}

type RazorpayWebhookEvent = {
  event: string;
  id?: string;
  payload?: {
    payment?: { entity?: Record<string, unknown> };
    order?: { entity?: Record<string, unknown> };
  };
};

export async function handleRazorpayWebhookEvent(
  rawBody: string,
  signature: string,
  eventIdHeader?: string
): Promise<{ ok: boolean; duplicate?: boolean }> {
  const config = loadRazorpayConfig();
  if (!verifyWebhookSignature(rawBody, signature, config.webhookSecret)) {
    const err = new Error("Invalid webhook signature");
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const event = JSON.parse(rawBody) as RazorpayWebhookEvent;
  const eventId = eventIdHeader ?? event.id ?? `${event.event}-${Date.now()}`;

  const existingEvent = await ProcessedWebhookEvent.findOne({ eventId }).exec();
  if (existingEvent) {
    return { ok: true, duplicate: true };
  }

  await ProcessedWebhookEvent.create({
    eventId,
    eventType: event.event,
    processedAt: dayjs().toISOString(),
  });

  const paymentEntity = event.payload?.payment?.entity;
  const orderEntity = event.payload?.order?.entity;

  let orderId =
    (paymentEntity?.order_id as string | undefined) ??
    (orderEntity?.id as string | undefined);

  if (!orderId && paymentEntity?.id) {
    orderId = undefined;
  }

  const receipt =
    (orderEntity?.receipt as string | undefined) ??
    (paymentEntity?.notes as { receipt?: string } | undefined)?.receipt;

  let tx: ITransaction | null = null;
  if (orderId) {
    tx = await Transaction.findOne({ razorpayOrderId: orderId }).exec();
  }
  if (!tx && receipt) {
    tx = await Transaction.findOne({ id: receipt }).exec();
  }

  if (!tx) {
    return { ok: true };
  }

  if (!tx.razorpayWebhookEventIds) {
    tx.razorpayWebhookEventIds = [];
  }
  if (!tx.razorpayWebhookEventIds.includes(eventId)) {
    tx.razorpayWebhookEventIds.push(eventId);
  }

  if (event.event === "payment.captured" || event.event === "order.paid") {
    const paymentId = paymentEntity?.id as string | undefined;
    const capturedAmount = paymentEntity?.amount as number | undefined;
    tx.paymentStatus = assertValidPaymentStatus("payment_captured");
    if (paymentId) {
      tx.razorpayPaymentId = paymentId;
      tx.upiRefId = paymentId;
    }
    if (typeof capturedAmount === "number") {
      tx.capturedAmountPaise = capturedAmount;
    }
    tx.hasMatchingAllpayRecord = true;
    tx.paymentConfirmedAt = dayjs().toISOString();
    appendTimeline(tx, `Webhook: ${event.event}`);
    await tx.save();
  } else if (event.event === "payment.failed") {
    if (tx.paymentStatus !== "payment_captured") {
      tx.paymentStatus = assertValidPaymentStatus("payment_failed");
      tx.paymentFailedReason =
        (paymentEntity?.error_description as string | undefined) ?? "Payment failed";
      appendTimeline(tx, "Webhook: payment.failed");
      await tx.save();
    }
  }

  return { ok: true };
}

export async function markCheckoutOpened(txId: string): Promise<void> {
  const tx = await Transaction.findOne({ id: txId }).exec();
  if (!tx || tx.paymentStatus === "payment_captured") {
    return;
  }
  if (tx.paymentStatus === "order_created") {
    tx.paymentStatus = "checkout_opened";
    appendTimeline(tx, "Checkout opened");
    await tx.save();
  }
}
