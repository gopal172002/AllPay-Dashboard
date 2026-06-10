import { decodeBase64Image, checkAiGeneratedFromBase64 } from "../services/sightengineService";

describe("sightengineService", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("decodes base64 image data", () => {
    const png = Buffer.from("fake-image").toString("base64");
    const buf = decodeBase64Image(`data:image/png;base64,${png}`);
    expect(buf.toString()).toBe("fake-image");
  });

  it("skips check when Sightengine is not configured", async () => {
    delete process.env.SIGHTENGINE_API_USER;
    delete process.env.SIGHTENGINE_API_SECRET;
    const result = await checkAiGeneratedFromBase64("aGVsbG8=");
    expect(result.configured).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("rejects when ai_generated score exceeds threshold", async () => {
    process.env.SIGHTENGINE_API_USER = "user";
    process.env.SIGHTENGINE_API_SECRET = "secret";
    process.env.SIGHTENGINE_AI_THRESHOLD = "0.5";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        type: { ai_generated: 0.9 },
      }),
    }) as typeof fetch;

    const result = await checkAiGeneratedFromBase64("aGVsbG8=");
    expect(result.configured).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.aiGeneratedScore).toBe(0.9);
  });
});
