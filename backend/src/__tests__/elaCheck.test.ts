import sharp from "sharp";
import { runElaCheck } from "../services/receiptFraud/elaCheck";

describe("elaCheck", () => {
  it("returns a score without throwing for a valid jpeg buffer", async () => {
    const buf = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .jpeg()
      .toBuffer();
    const result = await runElaCheck(buf);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.maxScore).toBe(20);
    expect(Number.isFinite(result.anomalyRatio)).toBe(true);
  });
});
