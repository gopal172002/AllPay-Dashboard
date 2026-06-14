export type SightengineGenAiResult = {
  configured: boolean;
  passed: boolean;
  aiGeneratedScore: number;
  threshold: number;
  generators?: Record<string, number>;
  message: string;
  raw?: unknown;
};

function getThreshold(): number {
  const raw = process.env.SIGHTENGINE_AI_THRESHOLD;
  const n = raw ? Number(raw) : 0.65;
  return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.65;
}

function isEnabled(): boolean {
  if (process.env.ENABLE_RECEIPT_AI_CHECK === "false") return false;
  return Boolean(process.env.SIGHTENGINE_API_USER && process.env.SIGHTENGINE_API_SECRET);
}

export function decodeBase64Image(imageBase64: string): Buffer {
  const cleaned = imageBase64.replace(/^data:image\/[a-z+]+;base64,/i, "").trim();
  const buf = Buffer.from(cleaned, "base64");
  if (!buf.length) {
    throw new Error("Invalid image data");
  }
  return buf;
}

export async function checkAiGeneratedImage(
  buffer: Buffer,
  mimeType: string,
  filename = "receipt.jpg"
): Promise<SightengineGenAiResult> {
  const threshold = getThreshold();

  if (!isEnabled()) {
    return {
      configured: false,
      passed: true,
      aiGeneratedScore: 0,
      threshold,
      message: "AI receipt check skipped (Sightengine not configured).",
    };
  }

  const apiUser = process.env.SIGHTENGINE_API_USER!;
  const apiSecret = process.env.SIGHTENGINE_API_SECRET!;

  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType || "image/jpeg" });
  form.append("media", blob, filename);
  form.append("models", "genai");
  form.append("api_user", apiUser);
  form.append("api_secret", apiSecret);

  const res = await fetch("https://api.sightengine.com/1.0/check.json", {
    method: "POST",
    body: form,
  });

  const data = (await res.json()) as {
    status?: string;
    error?: { message?: string };
    type?: {
      ai_generated?: number;
      ai_generators?: Record<string, number>;
    };
  };

  if (!res.ok || data.status === "failure") {
    const msg = data.error?.message || `Sightengine request failed (${res.status})`;
    throw new Error(msg);
  }

  const score = Number(data.type?.ai_generated ?? 0);
  const passed = score < threshold;

  return {
    configured: true,
    passed,
    aiGeneratedScore: score,
    threshold,
    ...(data.type?.ai_generators ? { generators: data.type.ai_generators } : {}),
    message: passed
      ? "Receipt image passed AI authenticity check."
      : `Receipt appears AI-generated (score ${(score * 100).toFixed(1)}%, limit ${(threshold * 100).toFixed(0)}%).`,
    raw: data,
  };
}

export async function checkAiGeneratedFromBase64(
  imageBase64: string,
  mimeType = "image/jpeg"
): Promise<SightengineGenAiResult> {
  const buffer = decodeBase64Image(imageBase64);
  return checkAiGeneratedImage(buffer, mimeType);
}
