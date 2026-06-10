import type { ReceiptFraudAnalysis } from "../services/receiptFraud/receiptFraudService";

export type TransactionFlagRecord = {
  id: string;
  rule: string;
  reason: string;
  details: string;
  adminOnly?: boolean;
};

export function buildReceiptFraudFlags(
  transactionId: string,
  analysis: ReceiptFraudAnalysis
): TransactionFlagRecord[] {
  if (analysis.tier === "safe") return [];

  const reason =
    analysis.tier === "high_risk"
      ? "Receipt fraud — high risk"
      : "Receipt fraud — manual review";

  const componentLines = [
    `Score: ${analysis.fraudScore}/100 (${analysis.tierLabel})`,
    `Metadata: ${analysis.components.metadata.score}/${analysis.components.metadata.maxScore}`,
    `Sightengine: ${analysis.components.sightengine.score}/${analysis.components.sightengine.maxScore}`,
    `OCR: ${analysis.components.ocr.score}/${analysis.components.ocr.maxScore}`,
    `ELA: ${analysis.components.ela.score}/${analysis.components.ela.maxScore}`,
  ];

  const allFindings = [
    ...analysis.components.metadata.findings,
    ...analysis.components.sightengine.findings,
    ...analysis.components.ocr.findings,
    ...analysis.components.ela.findings,
  ];

  return [
    {
      id: `${transactionId}-receipt-fraud`,
      rule: "Receipt fraud score",
      reason,
      details: [...componentLines, ...allFindings].join(" · "),
      adminOnly: true,
    },
  ];
}

/** @deprecated Use buildReceiptFraudFlags — kept for tests referencing AI-only flags */
export function buildAiReceiptFlag(
  transactionId: string,
  aiCheck: { aiGeneratedScore: number; threshold: number }
): TransactionFlagRecord {
  return {
    id: `${transactionId}-ai-receipt`,
    rule: "AI-generated receipt",
    reason: "AI-generated receipt",
    details: `Receipt image scored ${(aiCheck.aiGeneratedScore * 100).toFixed(1)}% AI likelihood (threshold ${(aiCheck.threshold * 100).toFixed(0)}%).`,
    adminOnly: true,
  };
}

export function employeeVisibleFlags(flags: unknown): TransactionFlagRecord[] {
  const all = Array.isArray(flags) ? (flags as TransactionFlagRecord[]) : [];
  return all.filter((f) => !f.adminOnly);
}

export function sanitizeTransactionForEmployee(tx: Record<string, unknown>): Record<string, unknown> {
  const obj = { ...tx };
  delete obj.receiptFraudScore;
  delete obj.receiptFraudTier;
  delete obj.receiptFraudReport;
  const allFlags = (Array.isArray(obj.flags) ? obj.flags : []) as TransactionFlagRecord[];
  const visible = employeeVisibleFlags(allFlags);
  obj.flags = visible;
  const hadAdminOnly = allFlags.some((f) => f.adminOnly);
  if (obj.status === "flagged" && visible.length === 0 && hadAdminOnly) {
    obj.status = "pending";
  }
  return obj;
}

export function isFlaggedForEmployee(tx: { status: string; flags?: unknown }): boolean {
  const visible = employeeVisibleFlags(tx.flags);
  if (visible.length > 0) return true;
  if (tx.status !== "flagged") return false;
  const all = Array.isArray(tx.flags) ? (tx.flags as TransactionFlagRecord[]) : [];
  return !all.some((f) => f.adminOnly);
}
