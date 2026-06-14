/** Normalize API base so backend URLs always include `/api`. */

function normalizeApiBase(raw: string | undefined): string {

  let base = String(raw ?? "").trim();

  if (!base) return "/api";

  base = base.replace(/\/$/, "");

  // e.g. http://localhost:5000 → http://localhost:5000/api

  if (/^https?:\/\/[^/?#]+(?::\d+)?$/i.test(base)) {

    return `${base}/api`;

  }

  return base;

}



/** API base URL — defaults to `/api` (Vite dev proxy → backend on :5000). */

export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL as string | undefined);

