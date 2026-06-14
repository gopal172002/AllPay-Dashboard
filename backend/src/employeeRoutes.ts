import express, { type Request, type Response } from "express";
import dayjs from "dayjs";
import multer from "multer";
import { Transaction, PaymentProof, Employee } from "./models";
import { requireEmployeeUser, employeeIdFromReq } from "./middleware/employeeAuth";
import { parseTransactionQuery } from "./utils/transactionQuery";
import {
  computeAggregatedFromTxs,
  computeDailySpendFromTxs,
  type TimelineBucket,
} from "./services/adminAnalyticsService";
import { computeEmployeeSpend } from "./services/employeeSpendService";
import { uploadFile } from "./services/s3Service";
import { analyzeReceiptFraud } from "./services/receiptFraud/receiptFraudService";
import {
  buildReceiptFraudFlags,
  isFlaggedForEmployee,
  sanitizeTransactionForEmployee,
} from "./utils/employeeTransactionView";

function queryString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function formatTransactionDoc(doc: { toObject: () => Record<string, unknown> }) {
  const obj = doc.toObject();
  if (obj["isNewTx"] !== undefined) {
    obj["isNew"] = obj["isNewTx"];
    delete obj["isNewTx"];
  }
  return obj;
}

function formatEmployeeTransactionDoc(doc: { toObject: () => Record<string, unknown> }) {
  return sanitizeTransactionForEmployee(formatTransactionDoc(doc));
}

async function listScopedTransactions(
  employeeId: string,
  raw: Record<string, string | string[] | undefined>,
  options: { defaultLimit?: number } = {}
) {
  const q: Record<string, string | string[] | undefined> = { ...raw, employeeId };
  if (options.defaultLimit != null && q["limit"] == null && q["page"] == null) {
    q["page"] = "1";
    q["limit"] = String(options.defaultLimit);
  }
  const { page, limit, skip, filter } = parseTransactionQuery(q);
  filter.employeeId = employeeId;
  const [items, total] = await Promise.all([
    Transaction.find(filter).sort({ dateTime: -1 }).skip(skip).limit(limit).exec(),
    Transaction.countDocuments(filter),
  ]);
  return {
    transactions: items.map(formatEmployeeTransactionDoc),
    transactionPage: page,
    transactionPageSize: limit,
    transactionTotal: total,
    hasMoreTransactions: page * limit < total,
  };
}

function computeSummary(transactions: Array<{ status: string; amount: number; flags?: unknown; receiptUrl?: string }>) {
  const now = dayjs();
  let pendingReview = 0;
  let withFlags = 0;
  let approvedThisMonth = 0;
  let proofsAwaiting = 0;
  for (const tx of transactions) {
    if (tx.status === "pending") pendingReview += 1;
    if (isFlaggedForEmployee(tx)) withFlags += 1;
    if (tx.status === "approved" && dayjs((tx as { dateTime?: string }).dateTime).isSame(now, "month")) {
      approvedThisMonth += tx.amount;
    }
    if (tx.status === "pending" && !tx.receiptUrl) proofsAwaiting += 1;
  }
  return { pendingReview, withFlags, approvedThisMonth, proofsAwaiting };
}

export function registerEmployeeRoutes(
  router: express.Router,
  authMiddleware: express.RequestHandler,
  upload: multer.Multer
) {
  const employeeRouter = express.Router();
  employeeRouter.use(authMiddleware, requireEmployeeUser);

  employeeRouter.get("/bootstrap", async (req: Request, res: Response) => {
    try {
      const employeeId = employeeIdFromReq(req);
      const empDoc = await Employee.findOne({ id: employeeId }).lean();
      const employee = empDoc
        ? {
            id: empDoc.id,
            name: empDoc.name,
            email: empDoc.email,
            department: empDoc.department,
            role: empDoc.role,
            active: empDoc.active,
            onboarded: empDoc.onboarded,
            travelApproved: empDoc.travelApproved,
          }
        : req.employeeUser!;
      const [txBlock, proofs] = await Promise.all([
        listScopedTransactions(employeeId, req.query as Record<string, string | string[] | undefined>, {
          defaultLimit: 500,
        }),
        PaymentProof.find({ employeeId }).sort({ createdAt: -1 }).limit(50).lean(),
      ]);
      const txs = txBlock.transactions as Array<{
        status: string;
        amount: number;
        flags?: unknown;
        receiptUrl?: string;
        dateTime: string;
        category: string;
      }>;
      const summary = computeSummary(txs);
      const proofsPending = proofs.filter((p) => p.status === "pending").length;
      const spendRows = txs.map((t) => ({
        amount: Number(t.amount),
        dateTime: t.dateTime,
        category: t.category,
        status: t.status,
      }));
      const spendSummary = computeEmployeeSpend(spendRows, 30);
      res.json({
        ...txBlock,
        employee,
        summary: { ...summary, proofsAwaitingReview: proofsPending },
        paymentProofs: proofs,
        spendSummary,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  employeeRouter.get("/spend", async (req: Request, res: Response) => {
    try {
      const employeeId = employeeIdFromReq(req);
      const rangeStr = queryString(req.query["rangeDays"]);
      const parsed = parseInt(rangeStr ?? "30", 10);
      const rangeDays = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 365) : 30;
      const end = dayjs().endOf("day");
      const start = end.subtract(rangeDays, "day").startOf("day");
      const rawTxs = await Transaction.find({
        employeeId,
        dateTime: { $gte: start.toISOString(), $lte: end.toISOString() },
      })
        .select("amount dateTime category status")
        .lean();
      const rows = rawTxs.map((t) => ({
        amount: Number(t.amount),
        dateTime: t.dateTime,
        category: t.category,
        status: t.status,
      }));
      res.json(computeEmployeeSpend(rows, rangeDays));
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  employeeRouter.get("/transactions", async (req: Request, res: Response) => {
    try {
      const data = await listScopedTransactions(
        employeeIdFromReq(req),
        req.query as Record<string, string | string[] | undefined>
      );
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  employeeRouter.get("/transactions/:id", async (req: Request, res: Response) => {
    try {
      const rawId = req.params["id"];
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "Missing transaction id" });
      }
      const employeeId = employeeIdFromReq(req);
      const tx = await Transaction.findOne({ id, employeeId }).exec();
      if (!tx) return res.status(404).json({ error: "Not found" });
      res.json({ transaction: formatEmployeeTransactionDoc(tx) });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  employeeRouter.get("/analytics/aggregated", async (req: Request, res: Response) => {
    try {
      const employeeId = employeeIdFromReq(req);
      const startDate = queryString(req.query["startDate"]);
      const endDate = queryString(req.query["endDate"]);
      const raw = queryString(req.query["timelineBucket"]);
      const bucket: TimelineBucket =
        raw === "weekly" || raw === "monthly" ? raw : "daily";
      const endD = endDate ? dayjs(endDate) : dayjs();
      const startD = startDate ? dayjs(startDate) : endD.subtract(30, "day");
      const gte = startD.startOf("day").toISOString();
      const lte = endD.endOf("day").toISOString();
      const rawTxs = await Transaction.find({
        employeeId,
        dateTime: { $gte: gte, $lte: lte },
      })
        .select("amount dateTime category status flags employeeId employeeName")
        .lean();
      const rows = rawTxs.map((t) => ({
        amount: Number(t.amount),
        dateTime: t.dateTime,
        category: t.category,
        employeeId: t.employeeId,
        employeeName: t.employeeName,
        status: t.status,
        flags: Array.isArray(t.flags) ? t.flags : [],
      }));
      const data = computeAggregatedFromTxs(rows, gte, lte, bucket);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  employeeRouter.get("/analytics/daily-spend", async (req: Request, res: Response) => {
    try {
      const employeeId = employeeIdFromReq(req);
      const dateStr = queryString(req.query["date"]);
      const day = dateStr ? dayjs(dateStr, "YYYY-MM-DD", true) : dayjs();
      const ymd = day.isValid() ? day.format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
      const gte = dayjs(ymd, "YYYY-MM-DD").startOf("day").toISOString();
      const lte = dayjs(ymd, "YYYY-MM-DD").endOf("day").toISOString();
      const rawTxs = await Transaction.find({
        employeeId,
        dateTime: { $gte: gte, $lte: lte },
      })
        .select("amount dateTime category status flags employeeId employeeName")
        .lean();
      const rows = rawTxs.map((t) => ({
        amount: Number(t.amount),
        dateTime: t.dateTime,
        category: t.category,
        employeeId: t.employeeId,
        employeeName: t.employeeName,
        status: t.status,
        flags: Array.isArray(t.flags) ? t.flags : [],
      }));
      res.json(computeDailySpendFromTxs(rows, ymd));
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  employeeRouter.get("/payment-proofs", async (req: Request, res: Response) => {
    try {
      const proofs = await PaymentProof.find({ employeeId: employeeIdFromReq(req) })
        .sort({ createdAt: -1 })
        .lean();
      res.json({ paymentProofs: proofs });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  employeeRouter.post("/payment-proofs", upload.single("receipt"), async (req: Request, res: Response) => {
    try {
      const emp = req.employeeUser!;
      const body = req.body as {
        paymentType?: string;
        amount?: string | number;
        description?: string;
      };
      const paymentType = String(body.paymentType || "Bank transfer / NEFT / RTGS").trim();
      const amount = Number(body.amount);
      const description = String(body.description || "").trim();
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }
      if (!description) {
        return res.status(400).json({ error: "Description is required" });
      }
      const id = `PP-${Date.now().toString(36)}`;
      let receiptUrl: string | undefined;
      let fraudAnalysis: Awaited<ReturnType<typeof analyzeReceiptFraud>> | undefined;
      if (req.file) {
        try {
          fraudAnalysis = await analyzeReceiptFraud(
            req.file.buffer,
            req.file.mimetype,
            req.file.originalname,
            { claimedAmount: amount }
          );
        } catch (fraudErr) {
          console.error("Receipt fraud pipeline failed (payment proof):", fraudErr);
        }
        receiptUrl = await uploadFile(
          req.file.buffer,
          id,
          req.file.mimetype,
          req.file.originalname
        );
      }
      const proof = await PaymentProof.create({
        id,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        paymentType,
        amount,
        description,
        ...(receiptUrl ? { receiptUrl } : {}),
        status: "pending",
        createdAt: dayjs().toISOString(),
      });
      const txId = `TX-PP-${id}`;
      const txFlags = fraudAnalysis ? buildReceiptFraudFlags(txId, fraudAnalysis) : [];
      const txStatus: "pending" | "flagged" =
        fraudAnalysis && fraudAnalysis.tier !== "safe" ? "flagged" : "pending";
      const tx = await Transaction.create({
        id: txId,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        merchantName: description.slice(0, 80) || "Manual payment proof",
        mcc: "0000",
        category: "Manual proof",
        amount,
        claimedAmount: amount,
        dateTime: dayjs().toISOString(),
        status: txStatus,
        upiApp: "GPay",
        upiRefId: id,
        isNewTx: true,
        flags: txFlags,
        hasMatchingAllpayRecord: false,
        purposeCategory: paymentType,
        paymentStatus: "legacy_simulated",
        ...(fraudAnalysis
          ? {
              receiptFraudScore: fraudAnalysis.fraudScore,
              receiptFraudTier: fraudAnalysis.tier,
              receiptFraudReport: fraudAnalysis,
            }
          : {}),
        timeline: [
          {
            id: `${id}-submitted`,
            actor: emp.name,
            action: "Payment proof submitted for finance review",
            timestamp: dayjs().toISOString(),
          },
        ],
        ...(receiptUrl ? { receiptUrl } : {}),
      });
      proof.transactionId = tx.id;
      await proof.save();
      res.json({
        ok: true,
        paymentProof: proof.toObject(),
        transaction: formatEmployeeTransactionDoc(tx),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  employeeRouter.post(
    "/transactions/:id/receipt",
    upload.single("receipt"),
    async (req: Request, res: Response) => {
      try {
        const rawId = req.params["id"];
        const id = Array.isArray(rawId) ? rawId[0] : rawId;
        if (!id || typeof id !== "string") {
          return res.status(400).json({ error: "Missing transaction id" });
        }
        const receiptFile = req.file;
        if (!receiptFile) {
          return res.status(400).json({ error: "No file uploaded" });
        }
        const employeeId = employeeIdFromReq(req);
        const tx = await Transaction.findOne({ id, employeeId });
        if (!tx) return res.status(404).json({ error: "Not found" });
        let fraudAnalysis: Awaited<ReturnType<typeof analyzeReceiptFraud>> | undefined;
        try {
          fraudAnalysis = await analyzeReceiptFraud(
            receiptFile.buffer,
            receiptFile.mimetype,
            receiptFile.originalname,
            { claimedAmount: tx.claimedAmount }
          );
        } catch (fraudErr) {
          console.error("Receipt fraud pipeline failed (receipt upload):", fraudErr);
        }
        const receiptUrl = await uploadFile(
          receiptFile.buffer,
          id,
          receiptFile.mimetype,
          receiptFile.originalname
        );
        tx.receiptUrl = receiptUrl;
        if (fraudAnalysis) {
          tx.receiptFraudScore = fraudAnalysis.fraudScore;
          tx.receiptFraudTier = fraudAnalysis.tier;
          tx.receiptFraudReport = fraudAnalysis;
          if (fraudAnalysis.tier !== "safe") {
            const newFlags = buildReceiptFraudFlags(tx.id, fraudAnalysis);
            const existing = Array.isArray(tx.flags) ? tx.flags : [];
            const merged = [...existing.filter((f) => f.id !== newFlags[0]?.id), ...newFlags];
            tx.flags = merged;
            tx.status = "flagged";
          }
        }
        await tx.save();
        res.json({
          ok: true,
          transactionId: id,
          receiptUrl,
          transaction: formatEmployeeTransactionDoc(tx),
        });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    }
  );

  employeeRouter.patch("/profile", async (req: Request, res: Response) => {
    try {
      const employeeId = employeeIdFromReq(req);
      const { name, department } = req.body as { name?: string; department?: string };
      const emp = await Employee.findOne({ id: employeeId }).exec();
      if (!emp) return res.status(404).json({ error: "Not found" });
      if (name?.trim()) emp.name = name.trim();
      if (department?.trim()) emp.department = department.trim();
      await emp.save();
      req.employeeUser = {
        id: emp.id,
        name: emp.name,
        email: emp.email,
        department: emp.department,
        role: emp.role,
        active: emp.active,
        onboarded: emp.onboarded,
        travelApproved: emp.travelApproved,
      };
      res.json({ ok: true, employee: req.employeeUser });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.use("/employee", employeeRouter);
}
