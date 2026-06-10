import Tesseract from "tesseract.js";

function ocrEnabled(): boolean {
  return process.env.ENABLE_RECEIPT_OCR !== "false";
}

export async function runOcrCheck(
  buffer: Buffer,
  claimedAmount?: number
): Promise<{
  score: number;
  maxScore: number;
  findings: string[];
  textLength: number;
  confidence: number;
}> {
  const maxScore = 20;
  if (!ocrEnabled()) {
    return {
      score: 0,
      maxScore,
      findings: ["OCR skipped (ENABLE_RECEIPT_OCR=false)"],
      textLength: 0,
      confidence: 0,
    };
  }

  const findings: string[] = [];
  let score = 0;

  try {
    const result = await Tesseract.recognize(buffer, "eng", {
      logger: () => undefined,
    });
    const text = result.data.text.replace(/\s+/g, " ").trim();
    const confidence = result.data.confidence ?? 0;

    if (text.length < 12) {
      score += 15;
      findings.push("Very little readable text on receipt (OCR)");
    } else if (text.length < 35) {
      score += 8;
      findings.push("Limited receipt text extracted (OCR)");
    }

    if (claimedAmount != null && claimedAmount > 0) {
      const digits = String(Math.round(claimedAmount));
      const numericBlob = text.replace(/[^\d]/g, "");
      if (!text.includes(digits) && !numericBlob.includes(digits)) {
        score += 8;
        findings.push("Submitted amount not found in OCR text");
      }
    }

    if (confidence > 0 && confidence < 45) {
      score += 5;
      findings.push(`Low OCR confidence (${confidence.toFixed(0)}%)`);
    }

    return {
      score: Math.min(maxScore, score),
      maxScore,
      findings,
      textLength: text.length,
      confidence,
    };
  } catch {
    return {
      score: 4,
      maxScore,
      findings: ["OCR extraction failed"],
      textLength: 0,
      confidence: 0,
    };
  }
}
