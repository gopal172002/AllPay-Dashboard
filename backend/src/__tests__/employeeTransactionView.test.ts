import {
  buildReceiptFraudFlags,
  isFlaggedForEmployee,
  sanitizeTransactionForEmployee,
} from "../utils/employeeTransactionView";

describe("employeeTransactionView", () => {
  const highRiskAnalysis = {
    fraudScore: 85,
    tier: "high_risk" as const,
    tierLabel: "High Risk",
    summary: "high",
    components: {
      metadata: { score: 10, maxScore: 20, findings: [] },
      sightengine: { score: 40, maxScore: 40, findings: [], configured: true },
      ocr: { score: 15, maxScore: 20, findings: [] },
      ela: { score: 20, maxScore: 20, findings: [] },
    },
  };

  it("builds admin-only fraud flags for high risk", () => {
    const flags = buildReceiptFraudFlags("TX-1", highRiskAnalysis);
    expect(flags[0]?.adminOnly).toBe(true);
    expect(flags[0]?.reason).toBe("Receipt fraud — high risk");
  });

  it("hides fraud flags from employee view", () => {
    const flags = buildReceiptFraudFlags("TX-1", highRiskAnalysis);
    const sanitized = sanitizeTransactionForEmployee({
      id: "TX-1",
      status: "flagged",
      receiptFraudScore: 85,
      receiptFraudTier: "high_risk",
      flags,
    });
    expect(sanitized.flags).toEqual([]);
    expect(sanitized.status).toBe("pending");
    expect(sanitized.receiptFraudScore).toBeUndefined();
  });

  it("counts flagged for employee when non-admin flags exist", () => {
    expect(
      isFlaggedForEmployee({
        status: "flagged",
        flags: [{ id: "f1", rule: "x", reason: "x", details: "x" }],
      })
    ).toBe(true);
    expect(
      isFlaggedForEmployee({
        status: "flagged",
        flags: buildReceiptFraudFlags("TX-1", highRiskAnalysis),
      })
    ).toBe(false);
  });
});
