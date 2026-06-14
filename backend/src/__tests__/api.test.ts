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
    expect(res.body.user?.adminId).toBeUndefined();
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

  it("GET /api/admin/bootstrap returns payload with collections and transaction pagination meta", async () => {
    const res = await request(app)
      .get("/api/admin/bootstrap")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.transactions)).toBe(true);
    expect(res.body.transactions.length).toBeGreaterThan(0);
    expect(typeof res.body.transactionTotal).toBe("number");
    expect(res.body.transactionTotal).toBeGreaterThanOrEqual(2);
    expect(res.body.hasMoreTransactions).toBe(false);
    expect(Array.isArray(res.body.employees)).toBe(true);
    expect(Array.isArray(res.body.policies)).toBe(true);
    expect(res.body.alertsConfig).toBeDefined();
    expect(Array.isArray(res.body.admins)).toBe(true);
    expect(res.body.billing).toBeDefined();
    expect(Array.isArray(res.body.exportAudits)).toBe(true);
  });

  it("GET /api/admin/transactions returns a page and total", async () => {
    const res = await request(app)
      .get("/api/admin/transactions?page=1&limit=1")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.transactions.length).toBe(1);
    expect(res.body.transactionTotal).toBeGreaterThanOrEqual(2);
    expect(res.body.hasMoreTransactions).toBe(true);
  });

  it("GET /api/admin/analytics/daily-spend returns totals and category mix", async () => {
    const res = await request(app)
      .get("/api/admin/analytics/daily-spend")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(typeof res.body.date).toBe("string");
    expect(typeof res.body.totalSpend).toBe("number");
    expect(typeof res.body.transactionCount).toBe("number");
    expect(Array.isArray(res.body.byCategory)).toBe(true);
  });

  it("GET /api/admin/analytics/aggregated returns KPIs and series", async () => {
    const res = await request(app)
      .get("/api/admin/analytics/aggregated?timelineBucket=daily")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.kpis).toBeDefined();
    expect(typeof res.body.kpis.totalSpend).toBe("number");
    expect(Array.isArray(res.body.byCategory)).toBe(true);
    expect(Array.isArray(res.body.byEmployee)).toBe(true);
    expect(Array.isArray(res.body.timeline)).toBe(true);
    expect(Array.isArray(res.body.topSpenders)).toBe(true);
  });

  it("POST /api/admin/policies/preview returns wouldFlagCount", async () => {
    const res = await request(app)
      .post("/api/admin/policies/preview")
      .set(authHeader(token))
      .send({
        id: "POL-PREV",
        name: "Preview test",
        mccCategory: "Meals",
        maxPerTransaction: 1000,
        maxPerMonth: 1000000,
        allowedDays: [1, 2, 3, 4, 5, 6, 0],
        scopeType: "all",
        startDate: "2000-01-01",
        active: true
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.wouldFlagCount).toBe("number");
  });

  it("returns 403 for admin routes when the user is not in AdminUser", async () => {
    const up = await request(app)
      .post("/api/auth/signup")
      .send({
        email: "noadmin@example.com",
        password: "x",
        fullName: "X",
        companyName: "Y",
        companySize: "1-10",
        monthlySpend: "50K",
        companyType: "LLC"
      });
    expect(up.status).toBe(200);
    const t = up.body.token as string;
    const res = await request(app).get("/api/admin/bootstrap").set(authHeader(t));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("NOT_ADMIN");
  });

  it("auditor cannot approve transactions (403)", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "auditor@example.com", password: "password123" });
    expect(login.status).toBe(200);
    const audToken = login.body.token as string;
    const res = await request(app)
      .post("/api/admin/transactions/approve")
      .set(authHeader(audToken))
      .send({ transactionId: "TX-70001", amount: 1 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("RBAC_FORBIDDEN");
  });

  it("auditor can record export (allowed role)", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "auditor@example.com", password: "password123" });
    const audToken = login.body.token as string;
    const res = await request(app)
      .post("/api/admin/exports")
      .set(authHeader(audToken))
      .send({ format: "csv", dateRange: "all", recordCount: 1 });
    expect(res.status).toBe(200);
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

  it("POST /api/admin/employees/import parses rows and creates employees", async () => {
    const res = await request(app)
      .post("/api/admin/employees/import")
      .set(authHeader(token))
      .send({
        csvText: "id,name,email,department,role\nEMP-CSV-1,Jane,csv-emp-1@example.com,Eng,employee"
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.createdCount).toBe(1);
    expect(res.body.created[0].email).toBe("csv-emp-1@example.com");
  });

  it("POST /api/admin/employees/invite persists an employee and inviteToken", async () => {
    const res = await request(app)
      .post("/api/admin/employees/invite")
      .set(authHeader(token))
      .send({ email: "invite-unique-1@example.com", department: "Engineering" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.employee?.email).toBe("invite-unique-1@example.com");
    expect(res.body.employee?.inviteToken).toBeDefined();
    expect(res.body.inviteCode).toMatch(/^ALLPAY[A-Z0-9]{6}$/);
    expect(res.body.employee?.inviteCode).toBe(res.body.inviteCode);
    expect(res.body.employee?.idAssigned).toBe(false);
    expect(String(res.body.employee?.id)).toMatch(/^PEND-/);
  });

  it("mobile onboarding: invite code → profile → OTP → complete", async () => {
    const inviteRes = await request(app)
      .post("/api/admin/employees/invite")
      .set(authHeader(token))
      .send({ email: "mobile-onboard@test.local", name: "Mobile Onboard", department: "Sales" });
    expect(inviteRes.status).toBe(200);
    const inviteCode = inviteRes.body.inviteCode as string;

    const verifyRes = await request(app)
      .post("/api/mobile/onboarding/verify-invite")
      .send({ inviteCode });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.ok).toBe(true);
    expect(verifyRes.body.profile?.email).toBe("mobile-onboard@test.local");
    expect(verifyRes.body.profile?.name).toBe("Mobile Onboard");
    const onboardingToken = verifyRes.body.onboardingToken as string;

    const confirmRes = await request(app)
      .post("/api/mobile/onboarding/confirm-profile")
      .set(authHeader(onboardingToken))
      .send({ phone: "+919876543210" });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.profile?.phone).toBe("+919876543210");

    const otpSendRes = await request(app)
      .post("/api/mobile/onboarding/send-otp")
      .set(authHeader(onboardingToken));
    expect(otpSendRes.status).toBe(200);

    const otpVerifyRes = await request(app)
      .post("/api/mobile/onboarding/verify-otp")
      .set(authHeader(onboardingToken))
      .send({ otp: "123456" });
    expect(otpVerifyRes.status).toBe(200);
    expect(otpVerifyRes.body.step).toBe("complete");

    const completeRes = await request(app)
      .post("/api/mobile/onboarding/complete")
      .set(authHeader(onboardingToken));
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.token).toBeTruthy();
    expect(completeRes.body.profile?.email).toBe("mobile-onboard@test.local");
  });

  it("POST /api/mobile/onboarding/verify-invite accepts ALLPAY123 seed code", async () => {
    const res = await request(app)
      .post("/api/mobile/onboarding/company-invite")
      .send({ inviteCode: "ALLPAY123" });
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBeTruthy();
    expect(res.body.profile?.email).toBe("emp1@allpay.in");
  });

  it("mobile app verify-profile step matches ALLPAY123 employee email", async () => {
    const step1 = await request(app)
      .post("/api/mobile/onboarding/company-invite")
      .send({ inviteCode: "ALLPAY123" });
    expect(step1.status).toBe(200);
    const onboardingToken = step1.body.onboardingToken as string;

    const step2 = await request(app)
      .post("/api/mobile/onboarding/verify-profile")
      .send({
        onboardingToken,
        email: "emp1@allpay.in",
        fullName: "Employee 1",
        phone: "9876543210",
      });
    expect(step2.status).toBe(200);
    expect(step2.body.ok).toBe(true);
    expect(step2.body.step).toBe("otp");
  });

  it("employee register → assign-id → login with serial ID", async () => {
    const reg = await request(app).post("/api/auth/employee/register").send({
      email: "flow.employee@example.com",
      fullName: "Flow Employee",
      password: "password123",
      department: "Finance",
    });
    expect(reg.status).toBe(200);
    expect(reg.body.pending).toBe(true);

    const pendingLogin = await request(app).post("/api/auth/login").send({
      employeeId: "emp99",
      password: "password123",
      portal: "employee",
    });
    expect(pendingLogin.status).toBe(400);

    const assign = await request(app)
      .post("/api/admin/employees/assign-id")
      .set(authHeader(token))
      .send({ email: "flow.employee@example.com" });
    expect(assign.status).toBe(200);
    expect(assign.body.employeeId).toMatch(/^emp\d+$/);

    const login = await request(app).post("/api/auth/login").send({
      employeeId: assign.body.employeeId,
      password: "password123",
      portal: "employee",
    });
    expect(login.status).toBe(200);
    expect(login.body.user.employeeId).toBe(assign.body.employeeId);
  });

  it("admin reset-login clears AuthUser so employee can set password again", async () => {
    const invite = await request(app)
      .post("/api/admin/employees/invite")
      .set(authHeader(token))
      .send({ email: "reset-me@example.com", department: "Ops" });
    const assign = await request(app)
      .post("/api/admin/employees/assign-id")
      .set(authHeader(token))
      .send({ email: "reset-me@example.com" });
    const empId = assign.body.employeeId as string;

    await request(app).post("/api/auth/employee/register").send({
      email: "reset-me@example.com",
      employeeId: empId,
      password: "password123",
    });

    const reset = await request(app)
      .post("/api/admin/employees/reset-login")
      .set(authHeader(token))
      .send({ employeeId: empId });
    expect(reset.status).toBe(200);
    expect(reset.body.hadLogin).toBe(true);

    const login = await request(app).post("/api/auth/login").send({
      employeeId: empId,
      password: "password123",
      portal: "employee",
    });
    expect(login.status).toBe(400);
    expect(login.body.code).toBe("NEED_PASSWORD_SETUP");
  });

  it("login with assigned ID but no password returns NEED_PASSWORD_SETUP", async () => {
    const invite = await request(app)
      .post("/api/admin/employees/invite")
      .set(authHeader(token))
      .send({ email: "no-pass@example.com", department: "Ops" });
    const assign = await request(app)
      .post("/api/admin/employees/assign-id")
      .set(authHeader(token))
      .send({ email: "no-pass@example.com" });
    const empId = assign.body.employeeId as string;

    const login = await request(app).post("/api/auth/login").send({
      employeeId: empId,
      password: "anything123",
      portal: "employee",
    });
    expect(login.status).toBe(400);
    expect(login.body.code).toBe("NEED_PASSWORD_SETUP");

    const complete = await request(app).post("/api/auth/employee/register").send({
      email: "no-pass@example.com",
      employeeId: empId,
      password: "password123",
    });
    expect(complete.status).toBe(200);
    expect(complete.body.ready).toBe(true);

    const login2 = await request(app).post("/api/auth/login").send({
      employeeId: empId,
      password: "password123",
      portal: "employee",
    });
    expect(login2.status).toBe(200);
  });

  it("admin assigns ID before register → employee completes registration with ID", async () => {
    const invite = await request(app)
      .post("/api/admin/employees/invite")
      .set(authHeader(token))
      .send({ email: "assign-first@example.com", department: "Ops", name: "Assign First" });
    expect(invite.status).toBe(200);

    const assign = await request(app)
      .post("/api/admin/employees/assign-id")
      .set(authHeader(token))
      .send({ email: "assign-first@example.com" });
    expect(assign.status).toBe(200);
    const empId = assign.body.employeeId as string;

    const blocked = await request(app).post("/api/auth/employee/register").send({
      email: "assign-first@example.com",
      fullName: "Assign First",
      password: "password123",
    });
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe("COMPLETE_REGISTRATION");

    const complete = await request(app).post("/api/auth/employee/register").send({
      email: "assign-first@example.com",
      employeeId: empId,
      password: "password123",
    });
    expect(complete.status).toBe(200);
    expect(complete.body.ready).toBe(true);

    const login = await request(app).post("/api/auth/login").send({
      employeeId: empId,
      password: "password123",
      portal: "employee",
    });
    expect(login.status).toBe(200);
    expect(login.body.user.employeeId).toBe(empId);
  });

  it("complete registration rejected when account already exists from new joiner", async () => {
    await request(app).post("/api/auth/employee/register").send({
      email: "double-reg@example.com",
      fullName: "Double Reg",
      password: "password123",
    });
    const assign = await request(app)
      .post("/api/admin/employees/assign-id")
      .set(authHeader(token))
      .send({ email: "double-reg@example.com" });
    const empId = assign.body.employeeId as string;

    const again = await request(app).post("/api/auth/employee/register").send({
      email: "double-reg@example.com",
      employeeId: empId,
      password: "newpass123",
    });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe("ALREADY_REGISTERED");
    expect(again.body.employeeId).toBe(empId);

    const login = await request(app).post("/api/auth/login").send({
      employeeId: empId,
      password: "password123",
      portal: "employee",
    });
    expect(login.status).toBe(200);
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

  it("POST /api/mobile/transactions/sync upserts for seed employee", async () => {
    const id = `TX-MOB-${Date.now()}`;
    const res = await request(app)
      .post("/api/mobile/transactions/sync")
      .send({
        transaction: {
          id,
          employeeId: "EMP-1000",
          merchant: {
            vpa: "merchant@upi",
            name: "Test Store",
            category: "food",
            mcc: "5812"
          },
          amount: 99.5,
          timestamp: new Date().toISOString(),
          upiApp: "Google Pay",
          upiRefId: "UPI-MOB-1",
          status: "Recorded",
          receipts: [],
          location: null
        }
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.backendId).toBe(id);
    const doc = await Transaction.findOne({ id });
    expect(doc).toBeTruthy();
    expect(doc?.merchantName).toBe("Test Store");
    expect(doc?.status).toBe("pending");
    expect(doc?.merchantVpa).toBe("merchant@upi");
  });

  it("POST /api/mobile/transactions/sync 404 when employee unknown and no profile override", async () => {
    const id = `TX-MOB-X-${Date.now()}`;
    const res = await request(app)
      .post("/api/mobile/transactions/sync")
      .send({
        transaction: {
          id,
          employeeId: "EMP-NONEXISTENT",
          merchant: {
            vpa: "x@upi",
            name: "X",
            category: "office",
            mcc: "5999"
          },
          amount: 1,
          timestamp: new Date().toISOString(),
          upiApp: "PhonePe",
          status: "Recorded"
        }
      });
    expect(res.status).toBe(404);
  });

  it("POST /api/mobile/transactions/sync uses employeeName override when employee not in DB", async () => {
    const id = `TX-MOB-OVR-${Date.now()}`;
    const res = await request(app)
      .post("/api/mobile/transactions/sync")
      .send({
        transaction: {
          id,
          employeeId: "EMP-OVR-ONLY",
          merchant: {
            vpa: "m@upi",
            name: "Store",
            category: "food",
            mcc: "5812"
          },
          amount: 10,
          timestamp: new Date().toISOString(),
          upiApp: "Paytm",
          status: "Recorded"
        },
        employeeName: "Override User",
        department: "QA"
      });
    expect(res.status).toBe(200);
    const doc = await Transaction.findOne({ id });
    expect(doc?.employeeName).toBe("Override User");
    expect(doc?.department).toBe("QA");
  });

  it("POST /api/mobile/auth/employee-token returns JWT for valid invite", async () => {
    const inviteRes = await request(app)
      .post("/api/admin/employees/invite")
      .set(authHeader(token))
      .send({ email: "mobile-invite@test.local", name: "Mobile User" });
    expect(inviteRes.status).toBe(200);
    const emp = inviteRes.body.employee as { id: string; inviteToken: string };
    const tokRes = await request(app)
      .post("/api/mobile/auth/employee-token")
      .send({ employeeId: emp.id, inviteToken: emp.inviteToken });
    expect(tokRes.status).toBe(200);
    expect(tokRes.body.token).toBeTruthy();
  });

  it("POST /api/mobile/auth/employee-token returns 401 for invalid inviteToken", async () => {
    const res = await request(app)
      .post("/api/mobile/auth/employee-token")
      .send({ employeeId: "EMP-1000", inviteToken: "invalid-token" });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/mobile/transactions/:id updates reimbursement fields", async () => {
    const id = `TX-MOB-PATCH-${Date.now()}`;
    await request(app)
      .post("/api/mobile/transactions/sync")
      .send({
        transaction: {
          id,
          employeeId: "EMP-1000",
          merchant: { vpa: "a@b", name: "M", category: "food", mcc: "5812" },
          amount: 50,
          timestamp: new Date().toISOString(),
          upiApp: "Google Pay",
          status: "Recorded"
        }
      });
    const patch = await request(app)
      .patch(`/api/mobile/transactions/${encodeURIComponent(id)}`)
      .send({
        reimbursementPurpose: "Client lunch",
        reimbursementNote: "With ACME"
      });
    expect(patch.status).toBe(200);
    const doc = await Transaction.findOne({ id });
    expect(doc?.purposeCategory).toBe("Client lunch");
    expect(doc?.reimbursementNote).toBe("With ACME");
  });
});
