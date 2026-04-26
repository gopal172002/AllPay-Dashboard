import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import router from "./routes";
import { seedDatabase } from "./seed";

dotenv.config({ quiet: process.env.NODE_ENV === "test" });

const PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/allpay_db";

export const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", router);

export async function startServer() {
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
