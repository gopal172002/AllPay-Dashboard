import { tierFromScore } from "../services/receiptFraud/types";

jest.mock("../services/receiptFraud/metadataCheck", () => ({
  runMetadataCheck: jest.fn().mockResolvedValue({
    score: 10,
    maxScore: 20,
    findings: ["No EXIF"],
    hasExif: false,
  }),
}));

jest.mock("../services/receiptFraud/ocrCheck", () => ({
  runOcrCheck: jest.fn().mockResolvedValue({
    score: 5,
    maxScore: 20,
    findings: ["Limited text"],
    textLength: 20,
    confidence: 60,
  }),
}));

jest.mock("../services/receiptFraud/elaCheck", () => ({
  runElaCheck: jest.fn().mockResolvedValue({
    score: 12,
    maxScore: 20,
    findings: ["ELA anomalies"],
    anomalyRatio: 0.09,
  }),
}));

jest.mock("../services/sightengineService", () => ({
  checkAiGeneratedImage: jest.fn().mockResolvedValue({
    configured: true,
    passed: false,
    aiGeneratedScore: 0.9,
    threshold: 0.65,
    message: "fail",
  }),
}));

import { analyzeReceiptFraud } from "../services/receiptFraud/receiptFraudService";
import { buildReceiptFraudFlags } from "../utils/employeeTransactionView";

describe("receiptFraudService", () => {
  it("maps score to tiers", () => {
    expect(tierFromScore(10)).toBe("safe");
    expect(tierFromScore(45)).toBe("manual_review");
    expect(tierFromScore(85)).toBe("high_risk");
  });

  it("aggregates component scores into fraud analysis", async () => {
    const result = await analyzeReceiptFraud(
      Buffer.from("fake"),
      "image/jpeg",
      "r.jpg",
      { claimedAmount: 500 }
    );
    // metadata 10 + ocr 5 + ela 12 + sightengine 36 (0.9*40) = 63
    expect(result.fraudScore).toBe(63);
    expect(result.tier).toBe("manual_review");
    expect(result.components.metadata.score).toBe(10);
    expect(result.components.sightengine.score).toBe(36);
  });

  it("builds admin-only flags for non-safe tiers", () => {
    const flags = buildReceiptFraudFlags("TX-1", {
      fraudScore: 85,
      tier: "high_risk",
      tierLabel: "High Risk",
      summary: "high",
      components: {
        metadata: { score: 10, maxScore: 20, findings: [] },
        sightengine: { score: 40, maxScore: 40, findings: [], configured: true },
        ocr: { score: 15, maxScore: 20, findings: [] },
        ela: { score: 20, maxScore: 20, findings: [] },
      },
    });
    expect(flags[0]?.adminOnly).toBe(true);
    expect(flags[0]?.reason).toBe("Receipt fraud — high risk");
  });
});
