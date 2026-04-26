/**
 * E2E-style API tests: MongoDB required (e.g. docker-compose mongodb on 27017).
 * S3 uploads are mocked; no LocalStack needed for this suite.
 */
jest.mock("../services/s3Service", () => ({
  uploadFile: jest
    .fn()
    .mockResolvedValue("http://mock.localstack/receipts/tx/TX-70001/fake-receipt.png")
}));

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../server";
import { seedDatabase } from "../seed";
import { Transaction } from "../models";
import { uploadFile } from "../services/s3Service";

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("AllPay API", () => {
  let token: string;
  let memoryMongo: MongoMemoryServer | null = null;
  const mockedUpload = jest.mocked(uploadFile);

  beforeAll(async () => {
    if (process.env.USE_LIVE_MONGO) {
      await mongoose.connect(process.env.MONGO_URI!);
    } else {
      memoryMongo = await MongoMemoryServer.create();
      await mongoose.connect(memoryMongo.getUri());
    }
    await mongoose.connection.db?.dropDatabase();
    await seedDatabase();
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "password123" });
    if (loginRes.status !== 200 || !loginRes.body?.token) {
      throw new Error("Login failed in test setup: " + JSON.stringify(loginRes.body));
    }
    token = loginRes.body.token as string;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (memoryMongo) await memoryMongo.stop();
  });

  it("POST /api/auth/signup creates a user and returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        email: "newuser.apitest@example.com",
        password: "securePass1!",
        fullName: "API Test User",
        companyName: "Test Co",
        companySize: "1-10",
        monthlySpend: "50K",
        companyType: "LLC"
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user?.email).toBe("newuser.apitest@example.com");
  });

  it("POST /api/auth/login returns 400 for bad password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "wrong" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("POST /api/auth/login succeeds for seed user", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it("GET /api/admin/bootstrap returns 401 without token", async () => {
    const res = await request(app).get("/api/admin/bootstrap");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/bootstrap returns 401 for invalid token", async () => {
    const res = await request(app)
      .get("/api/admin/bootstrap")
      .set(authHeader("not-a.jwt"));
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/bootstrap returns payload with collections", async () => {
    const res = await request(app)
      .get("/api/admin/bootstrap")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.transactions)).toBe(true);
    expect(res.body.transactions.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.employees)).toBe(true);
    expect(Array.isArray(res.body.policies)).toBe(true);
    expect(res.body.alertsConfig).toBeDefined();
    expect(Array.isArray(res.body.admins)).toBe(true);
    expect(res.body.billing).toBeDefined();
    expect(Array.isArray(res.body.exportAudits)).toBe(true);
  });

  it("POST /api/admin/transactions/approve", async () => {
    const res = await request(app)
      .post("/api/admin/transactions/approve")
      .set(authHeader(token))
      .send({ transactionId: "TX-70001", amount: 450 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.transactionId).toBe("TX-70001");
  });

  it("POST /api/admin/transactions/approve returns 404 for unknown id", async () => {
    const res = await request(app)
      .post("/api/admin/transactions/approve")
      .set(authHeader(token))
      .send({ transactionId: "TX-99999", amount: 1 });
    expect(res.status).toBe(404);
  });

  it("POST /api/admin/transactions/reject", async () => {
    const res = await request(app)
      .post("/api/admin/transactions/reject")
      .set(authHeader(token))
      .send({ transactionId: "TX-70002", reason: "Policy violation" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /api/admin/transactions/bulk", async () => {
    const res = await request(app)
      .post("/api/admin/transactions/bulk")
      .set(authHeader(token))
      .send({ ids: ["TX-70001", "TX-70002"], decision: "approved" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /api/admin/policies creates a policy", async () => {
    const res = await request(app)
      .post("/api/admin/policies")
      .set(authHeader(token))
      .send({
        id: "POL-API-1",
        name: "Test policy from API",
        mccCategory: "Meals",
        maxPerTransaction: 500,
        maxPerMonth: 2000,
        allowedDays: [1, 2, 3, 4, 5],
        scopeType: "all",
        startDate: new Date().toISOString(),
        active: true
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.policy).toBeDefined();
  });

  it("PATCH /api/admin/alerts updates alert config", async () => {
    const res = await request(app)
      .patch("/api/admin/alerts")
      .set(authHeader(token))
      .send({ delivery: "email" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.config.delivery).toBe("email");
  });

  it("PATCH /api/admin/billing updates plan", async () => {
    const res = await request(app)
      .patch("/api/admin/billing")
      .set(authHeader(token))
      .send({ plan: "Enterprise" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.plan).toBe("Enterprise");
  });

  it("PUT /api/admin/users upserts an admin", async () => {
    const res = await request(app)
      .put("/api/admin/users")
      .set(authHeader(token))
      .send({
        id: "ADM-API",
        name: "API Admin",
        email: "apiadmin@allpay.in",
        role: "finance_manager",
        active: true,
        twoFactor: false
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.admin?.id).toBe("ADM-API");
  });

  it("POST /api/admin/users/:id/toggle toggles active", async () => {
    const res = await request(app)
      .post("/api/admin/users/ADM-1/toggle")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /api/admin/exports records an export audit", async () => {
    const res = await request(app)
      .post("/api/admin/exports")
      .set(authHeader(token))
      .send({
        format: "csv",
        dateRange: "2025-01-01 to 2025-01-31",
        recordCount: 42
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /api/admin/employees/import", async () => {
    const res = await request(app)
      .post("/api/admin/employees/import")
      .set(authHeader(token))
      .send({ csvText: "id,name,email" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /api/admin/employees/invite", async () => {
    const res = await request(app)
      .post("/api/admin/employees/invite")
      .set(authHeader(token))
      .send({ email: "invite@example.com", department: "Engineering" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /api/admin/transactions/:id/receipt uploads and returns receiptUrl (S3 mocked)", async () => {
    mockedUpload.mockClear();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await request(app)
      .post("/api/admin/transactions/TX-70001/receipt")
      .set(authHeader(token))
      .attach("receipt", png, "receipt.png");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.receiptUrl).toBeTruthy();
    expect(mockedUpload).toHaveBeenCalled();
    const tx = await Transaction.findOne({ id: "TX-70001" });
    expect(tx?.receiptUrl).toBe(res.body.receiptUrl);
  });

  it("POST /api/admin/transactions/:id/receipt returns 400 without file", async () => {
    const res = await request(app)
      .post("/api/admin/transactions/TX-70001/receipt")
      .set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it("POST /api/admin/transactions/:id/receipt returns 404 for missing transaction", async () => {
    const res = await request(app)
      .post("/api/admin/transactions/TX-99999/receipt")
      .set(authHeader(token))
      .attach("receipt", Buffer.from("x"), "a.png");
    expect(res.status).toBe(404);
  });

  it("GET /api/admin/bootstrap rejects a token signed with the wrong secret", async () => {
    const bad = jwt.sign({ id: "x", email: "x@x.com" }, "wrong", { expiresIn: "1h" });
    const res = await request(app)
      .get("/api/admin/bootstrap")
      .set(authHeader(bad));
    expect(res.status).toBe(401);
  });
});
