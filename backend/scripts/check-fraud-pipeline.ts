/**
 * Live smoke test: employee payment proof → fraud report on admin bootstrap.
 * Run: npx tsx scripts/check-fraud-pipeline.ts
 */
/// <reference lib="dom" />
import "dotenv/config";
import sharp from "sharp";
import { analyzeReceiptFraud } from "../src/services/receiptFraud/receiptFraudService";

const API = process.env.SMOKE_API_BASE ?? "http://localhost:5000/api";

async function login(
  credentials: { email: string } | { employeeId: string },
  password: string,
  portal: "employee" | "admin"
) {
  const body =
    portal === "employee" && "employeeId" in credentials
      ? { employeeId: credentials.employeeId, password, portal }
      : { email: "email" in credentials ? credentials.email : "", password, portal };
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { token?: string; message?: string };
  const label = "employeeId" in credentials ? credentials.employeeId : credentials.email;
  if (!res.ok || !data.token) throw new Error(`Login failed (${label}): ${data.message ?? res.status}`);
  return data.token;
}

async function buildTestReceiptJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 400,
      height: 600,
      channels: 3,
      background: { r: 245, g: 245, b: 240 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="400" height="600"><text x="24" y="80" font-size="28" fill="#111">TAX INVOICE</text><text x="24" y="140" font-size="22" fill="#333">Amount: Rs.500</text><text x="24" y="200" font-size="18" fill="#333">Merchant: Demo Store</text><text x="24" y="260" font-size="18" fill="#333">Date: 09 Jun 2026</text></svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function main() {
  console.log("=== Receipt fraud pipeline check ===\n");

  console.log("Env:");
  console.log("  ENABLE_RECEIPT_FRAUD_PIPELINE:", process.env.ENABLE_RECEIPT_FRAUD_PIPELINE ?? "(unset)");
  console.log("  ENABLE_RECEIPT_OCR:", process.env.ENABLE_RECEIPT_OCR ?? "(unset)");
  console.log("  Sightengine configured:", Boolean(process.env.SIGHTENGINE_API_USER && process.env.SIGHTENGINE_API_SECRET));
  console.log();

  const testImage = await buildTestReceiptJpeg();
  console.log("1) Direct analyzeReceiptFraud() on sample receipt JPEG...");
  const direct = await analyzeReceiptFraud(testImage, "image/jpeg", "test-receipt.jpg", {
    claimedAmount: 500,
  });
  console.log("   fraudScore:", direct.fraudScore, "| tier:", direct.tier, `(${direct.tierLabel})`);
  console.log("   metadata:", direct.components.metadata.score + "/" + direct.components.metadata.maxScore, direct.components.metadata.findings[0] ?? "");
  console.log("   sightengine:", direct.components.sightengine.score + "/" + direct.components.sightengine.maxScore, "configured:", direct.components.sightengine.configured, direct.components.sightengine.findings[0] ?? "");
  console.log("   ocr:", direct.components.ocr.score + "/" + direct.components.ocr.maxScore, "textLen:", direct.components.ocr.textLength, direct.components.ocr.findings[0] ?? "");
  console.log("   ela:", direct.components.ela.score + "/" + direct.components.ela.maxScore, "ratio:", direct.components.ela.anomalyRatio?.toFixed(4), direct.components.ela.findings[0] ?? "");
  console.log();

  console.log("2) E2E: employee payment proof → admin bootstrap...");
  const employeeToken = await login({ employeeId: "emp0" }, "password123", "employee");
  const form = new FormData();
  form.append("paymentType", "Cash");
  form.append("amount", "500");
  form.append("description", "Fraud pipeline smoke test");
  form.append("receipt", new Blob([new Uint8Array(testImage)], { type: "image/jpeg" }), "smoke-test.jpg");

  const submitRes = await fetch(`${API}/employee/payment-proofs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${employeeToken}` },
    body: form,
  });
  const submitBody = (await submitRes.json()) as {
    ok?: boolean;
    transaction?: { id: string; status: string; flags: unknown[] };
    error?: string;
  };
  if (!submitRes.ok) throw new Error(`Payment proof failed: ${submitBody.error ?? submitRes.status}`);
  const txId = submitBody.transaction!.id;
  const submitTx = submitBody.transaction as { status: string; receiptUrl?: string };
  console.log("   submitted tx:", txId, "| employee sees status:", submitTx.status, "| receiptUrl:", submitTx.receiptUrl ?? "(none)");

  const adminToken = await login({ email: "test@example.com" }, "password123", "admin");
  const bootRes = await fetch(`${API}/admin/bootstrap?limit=500`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const boot = (await bootRes.json()) as {
    transactions: Array<{
      id: string;
      receiptFraudScore?: number;
      receiptFraudTier?: string;
      receiptFraudReport?: typeof direct;
      flags: Array<{ reason: string }>;
    }>;
  };
  const adminTx = boot.transactions.find((t) => t.id === txId);
  if (!adminTx) throw new Error("Transaction not found in admin bootstrap");

  console.log("   admin fraudScore:", adminTx.receiptFraudScore);
  console.log("   admin tier:", adminTx.receiptFraudTier);
  console.log("   admin flags:", adminTx.flags.map((f) => f.reason).join(", ") || "(none)");
  if (adminTx.receiptFraudReport?.components) {
    const c = adminTx.receiptFraudReport.components;
    console.log("   stored components: metadata", c.metadata.score, "sightengine", c.sightengine.score, "ocr", c.ocr.score, "ela", c.ela.score);
  }

  const allLayersRan =
    adminTx.receiptFraudReport != null &&
    adminTx.receiptFraudScore != null &&
    adminTx.receiptFraudReport.components.metadata != null &&
    adminTx.receiptFraudReport.components.sightengine != null &&
    adminTx.receiptFraudReport.components.ocr != null &&
    adminTx.receiptFraudReport.components.ela != null;

  console.log();
  if (allLayersRan) {
    console.log("RESULT: Pipeline is WORKING (all 4 layers stored on transaction).");
  } else {
    console.log("RESULT: Pipeline INCOMPLETE — missing fraud report on transaction.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
