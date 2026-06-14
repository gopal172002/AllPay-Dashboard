jest.mock("../services/s3Service", () => ({
  uploadFile: jest.fn().mockResolvedValue("http://localhost:5000/api/uploads/receipts/tx/test/fake.jpg"),
}));

jest.mock("../services/receiptFraud/receiptFraudService", () => ({
  analyzeReceiptFraud: jest.fn().mockResolvedValue({
    fraudScore: 88,
    tier: "high_risk",
    tierLabel: "High Risk",
    summary: "Fraud score 88/100 — high risk",
    components: {
      metadata: { score: 10, maxScore: 20, findings: ["No EXIF"] },
      sightengine: { score: 36, maxScore: 40, findings: ["AI 90%"], configured: true },
      ocr: { score: 12, maxScore: 20, findings: [] },
      ela: { score: 14, maxScore: 20, findings: [] },
    },
  }),
}));

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { app } from "../server";
import { seedDatabase } from "../seed";
import { Transaction } from "../models";

describe("employee payment proof fraud pipeline", () => {
  let employeeToken: string;
  let adminToken: string;
  let memoryMongo: MongoMemoryServer | null = null;

  beforeAll(async () => {
    if (process.env.USE_LIVE_MONGO) {
      await mongoose.connect(process.env.MONGO_URI!);
    } else {
      memoryMongo = await MongoMemoryServer.create();
      await mongoose.connect(memoryMongo.getUri());
    }
    await mongoose.connection.db?.dropDatabase();
    await seedDatabase();

    const employeeLogin = await request(app)
      .post("/api/auth/login")
      .send({
        employeeId: "emp0",
        password: "password123",
        portal: "employee",
      });
    employeeToken = employeeLogin.body.token;

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "password123", portal: "admin" });
    adminToken = adminLogin.body.token;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (memoryMongo) await memoryMongo.stop();
  });

  it("submits payment proof and stores fraud score for admin", async () => {
    const res = await request(app)
      .post("/api/employee/payment-proofs")
      .set("Authorization", `Bearer ${employeeToken}`)
      .field("paymentType", "Cash")
      .field("amount", "500")
      .field("description", "Fraud pipeline test")
      .attach("receipt", Buffer.from("fake-ai-image"), {
        filename: "receipt.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(200);
    expect(res.body.transaction.status).toBe("pending");
    expect(res.body.transaction.flags).toEqual([]);

    const txId = res.body.transaction.id as string;
    const stored = await Transaction.findOne({ id: txId }).lean();
    expect(stored?.status).toBe("flagged");
    expect(stored?.receiptFraudScore).toBe(88);
    expect(stored?.receiptFraudTier).toBe("high_risk");
    expect(stored?.flags?.[0]?.reason).toBe("Receipt fraud — high risk");

    const adminBootstrap = await request(app)
      .get("/api/admin/bootstrap?limit=500")
      .set("Authorization", `Bearer ${adminToken}`);
    const adminTx = adminBootstrap.body.transactions.find((t: { id: string }) => t.id === txId);
    expect(adminTx.receiptFraudScore).toBe(88);
    expect(adminTx.receiptFraudTier).toBe("high_risk");
  });
});
