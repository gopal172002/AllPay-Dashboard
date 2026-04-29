/**
 * Dev-only: exercise every HTTP route under /api from the browser (same origin rules as the app).
 * Expects a seeded DB (e.g. test@example.com / password123) for admin calls.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");

export type SmokeResult = {
  id: string;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  detail?: string;
};

function tinyPngBlob(): Blob {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "image/png" });
}

async function jsonCall(
  id: string,
  method: string,
  path: string,
  token: string | undefined,
  body?: unknown,
  acceptStatuses: readonly number[] = [200],
  extraHeaders: Record<string, string> = {}
): Promise<SmokeResult> {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const ok = acceptStatuses.includes(res.status);
    return {
      id,
      method,
      path,
      status: res.status,
      ok,
      detail: text.length > 400 ? `${text.slice(0, 400)}…` : text,
    };
  } catch (e) {
    return {
      id,
      method,
      path,
      status: 0,
      ok: false,
      detail: String(e),
    };
  }
}

export async function runApiSmokeTest(): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];
  const ts = Date.now();
  const signupEmail = `smoke-signup-${ts}@example.com`;

  const push = (r: SmokeResult) => results.push(r);

  push(
    await jsonCall(
      "auth-signup",
      "POST",
      "/auth/signup",
      undefined,
      {
        email: signupEmail,
        password: "SmokePass123!",
        fullName: "Smoke User",
        companyName: "Smoke Co",
        companySize: "1-10",
        monthlySpend: "50K",
        companyType: "LLC",
      },
      [200]
    )
  );

  let adminToken: string;
  try {
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
    });
    const loginData: { token?: string; message?: string } = await loginRes.json();
    if (!loginRes.ok || !loginData.token) {
      push({
        id: "auth-login",
        method: "POST",
        path: "/auth/login",
        status: loginRes.status,
        ok: false,
        detail: loginData.message || JSON.stringify(loginData),
      });
      return results;
    }
    adminToken = loginData.token;
    push({
      id: "auth-login",
      method: "POST",
      path: "/auth/login",
      status: loginRes.status,
      ok: true,
      detail: "ok",
    });
  } catch (e) {
    push({
      id: "auth-login",
      method: "POST",
      path: "/auth/login",
      status: 0,
      ok: false,
      detail: String(e),
    });
    return results;
  }

  const auth = adminToken;

  push(await jsonCall("admin-bootstrap", "GET", "/admin/bootstrap", auth));
  push(await jsonCall("admin-transactions", "GET", "/admin/transactions?limit=3", auth));
  push(await jsonCall("admin-analytics-daily", "GET", "/admin/analytics/daily-spend", auth));
  push(
    await jsonCall(
      "admin-analytics-aggregated",
      "GET",
      "/admin/analytics/aggregated?startDate=2024-01-01&endDate=2030-12-31&timelineBucket=daily",
      auth
    )
  );

  push(
    await jsonCall("admin-policies-preview", "POST", "/admin/policies/preview", auth, {
      id: `POL-SMOKE-${ts}`,
      name: "Smoke Preview",
      mccCategory: "Meals",
      maxPerTransaction: 100,
      maxPerMonth: 500,
      allowedDays: [1, 2, 3, 4, 5],
      scopeType: "all",
      startDate: "2000-01-01",
      active: true,
    })
  );

  push(
    await jsonCall("admin-tx-approve", "POST", "/admin/transactions/approve", auth, {
      transactionId: "TX-70001",
      amount: 450,
    })
  );

  push(
    await jsonCall("admin-tx-reject", "POST", "/admin/transactions/reject", auth, {
      transactionId: "TX-70002",
      reason: "smoke-test",
    })
  );

  push(
    await jsonCall("admin-tx-bulk", "POST", "/admin/transactions/bulk", auth, {
      ids: ["TX-70001"],
      decision: "approved",
      reason: "",
    })
  );

  const receiptUrl = `${API_BASE}/admin/transactions/TX-70001/receipt`;
  try {
    const fd = new FormData();
    fd.append("receipt", tinyPngBlob(), "smoke.png");
    const res = await fetch(receiptUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth}` },
      body: fd,
    });
    const text = await res.text();
    push({
      id: "admin-tx-receipt",
      method: "POST",
      path: "/admin/transactions/TX-70001/receipt",
      status: res.status,
      ok: res.status === 200,
      detail: text.length > 400 ? `${text.slice(0, 400)}…` : text,
    });
  } catch (e) {
    push({
      id: "admin-tx-receipt",
      method: "POST",
      path: "/admin/transactions/TX-70001/receipt",
      status: 0,
      ok: false,
      detail: String(e),
    });
  }

  push(
    await jsonCall("admin-policies-create", "POST", "/admin/policies", auth, {
      id: `POL-SMOKE-NEW-${ts}`,
      name: `Smoke policy ${ts}`,
      mccCategory: "Office",
      maxPerTransaction: 200,
      maxPerMonth: 2000,
      allowedDays: [1, 2, 3, 4, 5, 6, 0],
      scopeType: "all",
      startDate: new Date().toISOString(),
      active: true,
    })
  );

  const csv = `email,name,department\nsmoke-csv-${ts}@example.com,Smoke CSV,QA\n`;
  push(await jsonCall("admin-employees-import", "POST", "/admin/employees/import", auth, { csvText: csv }));

  push(
    await jsonCall("admin-employees-invite", "POST", "/admin/employees/invite", auth, {
      email: `smoke-inv-${ts}@example.com`,
      name: "Smoke Invite",
      department: "QA",
    })
  );

  push(
    await jsonCall("admin-alerts-patch", "PATCH", "/admin/alerts", auth, {
      delivery: "both",
      threshold: "daily_digest",
      mutedPolicies: [],
      mutedEmployees: [],
    })
  );

  push(
    await jsonCall("admin-billing-patch", "PATCH", "/admin/billing", auth, {
      plan: "Pro",
      billingCycle: "monthly",
      nextRenewal: "2030-01-01",
      licenses: 10,
      headcount: 9,
    })
  );

  push(
    await jsonCall("admin-users-put", "PUT", "/admin/users", auth, {
      id: "ADM-2",
      name: "Aman Sharma",
      email: "aman@allpay.in",
      role: "finance_manager",
      active: true,
      twoFactor: true,
    })
  );

  push(await jsonCall("admin-users-toggle-1", "POST", `/admin/users/ADM-2/toggle`, auth, undefined, [200], {}));
  push(await jsonCall("admin-users-toggle-2", "POST", `/admin/users/ADM-2/toggle`, auth, undefined, [200], {}));

  push(
    await jsonCall("admin-exports", "POST", "/admin/exports", auth, {
      format: "csv",
      dateRange: "last-30-days",
      recordCount: 1,
    })
  );

  const mobileTxId = `MOB-SMOKE-${ts}`;
  let employeeJwt: string | undefined;

  {
    const r = await jsonCall(
      "mobile-employee-token",
      "POST",
      "/mobile/auth/employee-token",
      undefined,
      { employeeId: "EMP-1000", inviteToken: "seed-invite-emp1000" },
      [200, 401]
    );
    push(r);
    if (r.ok && r.detail) {
      try {
        const j = JSON.parse(r.detail) as { token?: string };
        employeeJwt = j.token;
      } catch {
        /* ignore */
      }
    }
  }

  if (employeeJwt) {
    push(
      await jsonCall(
        "mobile-transactions-sync",
        "POST",
        "/mobile/transactions/sync",
        employeeJwt,
        {
          transaction: {
            id: mobileTxId,
            employeeId: "EMP-1000",
            merchant: { vpa: "smoke@pay", name: "Smoke Cafe", category: "Meals", mcc: "5812" },
            amount: 42,
            timestamp: new Date().toISOString(),
            upiApp: "GPay",
            upiRefId: `SMOKE-${ts}`,
            status: "Recorded",
          },
        },
        [200],
        { "Content-Type": "application/json" }
      )
    );

    push(
      await jsonCall(
        "mobile-transactions-patch",
        "PATCH",
        `/mobile/transactions/${encodeURIComponent(mobileTxId)}`,
        employeeJwt,
        {
          employeeId: "EMP-1000",
          reimbursementNote: "smoke patch",
        },
        [200],
        { "Content-Type": "application/json" }
      )
    );
  }

  return results;
}
