import sharp from "sharp";

/**
 * Error Level Analysis (ELA) — detects recompression / edit inconsistencies.
 * OpenCV-style forensics approximated via sharp recompress + pixel diff.
 */
export async function runElaCheck(buffer: Buffer): Promise<{
  score: number;
  maxScore: number;
  findings: string[];
  anomalyRatio: number;
}> {
  const findings: string[] = [];
  const maxScore = 20;
  let anomalyRatio = 0;
  let score = 0;

  try {
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) {
      return { score: 0, maxScore, findings: ["Could not read image dimensions"], anomalyRatio: 0 };
    }

    const maxSide = 640;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const original = await sharp(buffer).resize(w, h, { fit: "inside" }).grayscale().raw().toBuffer();
    const recompressed = await sharp(buffer)
      .resize(w, h, { fit: "inside" })
      .jpeg({ quality: 75 })
      .grayscale()
      .raw()
      .toBuffer();

    const len = Math.min(original.length, recompressed.length);
    let sumDiff = 0;
    let hotPixels = 0;
    for (let i = 0; i < len; i++) {
      const diff = Math.abs(original[i]! - recompressed[i]!);
      sumDiff += diff;
      if (diff > 40) hotPixels += 1;
    }
    anomalyRatio = len > 0 ? sumDiff / (len * 255) : 0;
    const hotRatio = len > 0 ? hotPixels / len : 0;

    if (anomalyRatio > 0.11 || hotRatio > 0.08) {
      score = 20;
      findings.push("Strong ELA anomalies — possible image tampering or heavy editing");
    } else if (anomalyRatio > 0.08 || hotRatio > 0.05) {
      score = 14;
      findings.push("Moderate ELA inconsistencies detected");
    } else if (anomalyRatio > 0.055) {
      score = 8;
      findings.push("Mild compression artifacts in ELA");
    }
  } catch {
    findings.push("ELA forensics check could not run");
    score = 0;
  }

  return { score: Math.min(maxScore, score), maxScore, findings, anomalyRatio };
}
