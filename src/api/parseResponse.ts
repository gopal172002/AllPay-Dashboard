/** Parse fetch responses safely — avoids opaque "Unexpected token '<'" JSON errors. */
export async function readJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return (await res.json()) as Record<string, unknown>;
    } catch {
      throw new Error("Server returned invalid JSON.");
    }
  }

  const text = await res.text();
  const start = text.trimStart().slice(0, 20).toLowerCase();
  if (
    start.startsWith("<!doctype") ||
    start.startsWith("<html") ||
    /cannot (get|post|put|patch|delete) /i.test(text)
  ) {
    throw new Error(
      "API route not found or backend is outdated. Stop and restart the backend (`cd backend && npm run dev`), then try again."
    );
  }
  if (res.status === 404) {
    throw new Error(
      "API route not found. Restart the backend (`cd backend && npm run dev`) to load the latest routes."
    );
  }

  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 140);
  throw new Error(
    snippet
      ? `Unexpected server response (${res.status}): ${snippet}`
      : `Unexpected server response (${res.status}). Is the backend running on port 5000?`
  );
}
