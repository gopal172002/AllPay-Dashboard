export type FraudTier = "safe" | "manual_review" | "high_risk";

export type FraudComponentResult = {
  score: number;
  maxScore: number;
  findings: string[];
};

export type ReceiptFraudAnalysis = {
  fraudScore: number;
  tier: FraudTier;
  tierLabel: string;
  components: {
    metadata: FraudComponentResult & { hasExif?: boolean };
    sightengine: FraudComponentResult & { aiGenerated?: number; configured: boolean };
    ocr: FraudComponentResult & { textLength?: number; confidence?: number };
    ela: FraudComponentResult & { anomalyRatio?: number };
  };
  summary: string;
};

export function tierFromScore(score: number): FraudTier {
  if (score <= 30) return "safe";
  if (score <= 70) return "manual_review";
  return "high_risk";
}

export function tierLabel(tier: FraudTier): string {
  if (tier === "safe") return "Safe";
  if (tier === "manual_review") return "Manual Review";
  return "High Risk";
}
