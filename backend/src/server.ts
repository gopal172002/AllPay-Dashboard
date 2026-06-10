import dns from "node:dns";
import path from "node:path";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import router from "./routes";
import { seedDatabase } from "./seed";
import { handleRazorpayWebhookEvent } from "./services/razorpayService";

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
  quiet: process.env.NODE_ENV === "test",
});

const PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/allpay_db";

export const app = express();

app.use(cors());

app.post(
  "/api/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-razorpay-signature"];
      const eventId = req.headers["x-razorpay-event-id"];
      const rawBody =
        req.body instanceof Buffer ? req.body.toString("utf8") : String(req.body ?? "");
      if (typeof signature !== "string") {
        return res.status(400).json({ ok: false, message: "Missing signature" });
      }
      const result = await handleRazorpayWebhookEvent(
        rawBody,
        signature,
        typeof eventId === "string" ? eventId : undefined
      );
      res.status(200).json(result);
    } catch (error) {
      const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 500;
      res.status(statusCode).json({ ok: false, message: (error as Error).message });
    }
  }
);

app.use(express.json({ limit: "15mb" }));

app.use(
  "/api/uploads/receipts",
  express.static(path.resolve(process.cwd(), "uploads/receipts"))
);

app.use("/api", router);

function configureMongoDns() {
  const isAtlas = MONGO_URI.includes("mongodb.net");
  if (!isAtlas) return;
  const servers = (process.env.MONGO_DNS_SERVERS ?? "8.8.8.8,1.1.1.1")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  dns.setServers(servers);
}

export async function startServer() {
  configureMongoDns();
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB at", MONGO_URI);
  await seedDatabase();
  return new Promise<void>((resolve) => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      resolve();
    });
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch((err) => {
    console.error("Failed to start server", err);
    process.exit(1);
  });
}
