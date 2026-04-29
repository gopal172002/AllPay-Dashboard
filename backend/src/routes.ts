import express from "express";
import { randomBytes } from "node:crypto";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dayjs from "dayjs";
import {
  AuthUser,
  Employee,
  Transaction,
  ExpensePolicy,
  AlertConfig,
  AdminUser,
  BillingPlan,
  ExportAudit
} from "./models";
import { uploadFile } from "./services/s3Service";
import { requireAdminUser, requireRoles } from "./middleware/adminAuth";
import {
  getDefaultBootstrapTxLimit,
  parseTransactionQuery
} from "./utils/transactionQuery";
import { getAggregated, getDailySpend } from "./services/adminAnalyticsService";
import type { TimelineBucket } from "./services/adminAnalyticsService";
import { runPolicyPreview } from "./services/policyPreviewService";
import type { ExpensePolicy as PolicyPreviewBody } from "./services/analyticsTypes";
import { mobileDeviceAuth, type MobileRequest } from "./middleware/mobileDeviceAuth";
import {
  mapMobileStatusToDashboard,
  mobileTxToDashboardFields,
  type MobileTransactionPayload
} from "./services/mobileTransactionMapper";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});
const JWT_SECRET = process.env.JWT_SECRET || "allpay_super_secret";

const R_FIN = requireRoles("super_admin", "finance_manager");
const R_HR = requireRoles("super_admin", "finance_manager", "hr_manager");
const R_BILL = requireRoles("super_admin");
const R_ADM = requireRoles("super_admin");
const R_EX = requireRoles("super_admin", "finance_manager", "auditor");
const R_ANAL = requireRoles("super_admin", "finance_manager", "hr_manager", "auditor");

const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as express.Request & { user?: { id: string; email: string } }).user = decoded as {
      id: string;
      email: string;
    };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

function formatTransactionDoc(doc: { toObject: () => Record<string, unknown> }) {
  const obj = doc.toObject();
  if (obj["isNewTx"] !== undefined) {
    obj["isNew"] = obj["isNewTx"];
    delete obj["isNewTx"];
  }
  return obj;
}

async function listTransactionsFromQuery(
  raw: Record<string, string | string[] | undefined>,
  options: { bootstrapDefaultLimit?: number } = {}
) {
  const q: Record<string, string | string[] | undefined> = { ...raw };
  if (options.bootstrapDefaultLimit != null && q["limit"] == null && q["page"] == null) {
    q["page"] = "1";
    q["limit"] = String(options.bootstrapDefaultLimit);
  }
  const { page, limit, skip, filter } = parseTransactionQuery(q);
  const [items, total] = await Promise.all([
    Transaction.find(filter).sort({ dateTime: -1 }).skip(skip).limit(limit).exec(),
    Transaction.countDocuments(filter)
  ]);
  return {
    transactions: items.map(formatTransactionDoc),
    transactionPage: page,
    transactionPageSize: limit,
    transactionTotal: total,
    hasMoreTransactions: page * limit < total
  };
}

// --- AUTH ROUTES ---
router.post("/auth/signup", async (req, res) => {
  try {
    const { email, password, ...rest } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await AuthUser.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ ok: false, message: "Account already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const id = `usr_${Date.now().toString(36)}`;
    const createdAt = new Date().toISOString();

    const newUser = new AuthUser({
      id,
      email: normalizedEmail,
      passwordHash,
      createdAt,
      ...rest
    });

    await newUser.save();

    const token = jwt.sign({ id, email: normalizedEmail }, JWT_SECRET, { expiresIn: "7d" });

    const userPayload = { ...newUser.toObject() } as Record<string, unknown>;
    delete userPayload.passwordHash;
    delete userPayload._id;
    delete userPayload.__v;

    const adminRecord = await AdminUser.findOne({ email: normalizedEmail, active: true });
    if (adminRecord) {
      userPayload["adminId"] = adminRecord.id;
      userPayload["adminRole"] = adminRecord.role;
    }

    res.json({ ok: true, user: userPayload, token });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await AuthUser.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ ok: false, message: "No account found." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ ok: false, message: "Incorrect password." });
    }

    const token = jwt.sign({ id: user.id, email: normalizedEmail }, JWT_SECRET, { expiresIn: "7d" });

    const userPayload = { ...user.toObject() } as Record<string, unknown>;
    delete userPayload.passwordHash;
    delete userPayload._id;
    delete userPayload.__v;

    const adminRecord = await AdminUser.findOne({ email: normalizedEmail, active: true });
    if (adminRecord) {
      userPayload["adminId"] = adminRecord.id;
      userPayload["adminRole"] = adminRecord.role;
    }

    res.json({ ok: true, user: userPayload, token });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

// --- MOBILE (AllpayEmployeeApp) — sync secret or employee JWT ---
router.post("/mobile/auth/employee-token", async (req, res) => {
  try {
    const { employeeId, inviteToken } = req.body as {
      employeeId?: string;
      inviteToken?: string;
    };
    if (!employeeId?.trim() || !inviteToken?.trim()) {
      return res.status(400).json({
        ok: false,
        message: "employeeId and inviteToken are required"
      });
    }
    const emp = await Employee.findOne({
      id: String(employeeId).trim(),
      inviteToken: String(inviteToken).trim()
    }).exec();
    if (!emp) {
      return res.status(401).json({ ok: false, message: "Invalid employeeId or inviteToken" });
    }
    const token = jwt.sign(
      { typ: "employee", employeeId: emp.id },
      JWT_SECRET,
      { expiresIn: "60d" }
    );
    res.json({ ok: true, token, employeeId: emp.id });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

async function resolveEmployeeForMobileSync(
  employeeId: string,
  overrides?: { employeeName?: string; department?: string }
): Promise<{ name: string; department: string } | null> {
  const emp = await Employee.findOne({ id: employeeId }).exec();
  if (emp) {
    return { name: emp.name, department: emp.department };
  }
  const name = overrides?.employeeName?.trim();
  if (name) {
    return { name, department: overrides?.department?.trim() || "Unassigned" };
  }
  return null;
}

router.post("/mobile/transactions/sync", mobileDeviceAuth, async (req: MobileRequest, res) => {
  try {
    const body = req.body as {
      transaction?: MobileTransactionPayload;
      employeeName?: string;
      department?: string;
    };
    const tx = body.transaction;
    if (!tx?.id || !tx.employeeId || !tx.merchant) {
      return res.status(400).json({
        ok: false,
        message: "transaction with id, employeeId, and merchant is required"
      });
    }
    if (req.mobileEmployeeId && req.mobileEmployeeId !== tx.employeeId) {
      return res.status(403).json({ ok: false, message: "Transaction employeeId does not match token" });
    }

    const syncOverrides: { employeeName?: string; department?: string } = {};
    if (typeof body.employeeName === "string" && body.employeeName.trim()) {
      syncOverrides.employeeName = body.employeeName.trim();
    }
    if (typeof body.department === "string" && body.department.trim()) {
      syncOverrides.department = body.department.trim();
    }
    const resolved = await resolveEmployeeForMobileSync(
      tx.employeeId,
      Object.keys(syncOverrides).length > 0 ? syncOverrides : undefined
    );
    if (!resolved) {
      return res.status(404).json({
        ok: false,
        message:
          "Employee not found. Add them in the dashboard (invite/import) or pass employeeName and department in the sync body."
      });
    }

    const fields = mobileTxToDashboardFields(tx, resolved.name, resolved.department);
    const syncEvent = {
      id: `mob-${Date.now().toString(36)}`,
      actor: "Employee app",
      action: "Synced from mobile",
      timestamp: dayjs().toISOString()
    };

    const existing = await Transaction.findOne({ id: tx.id }).exec();
    if (existing && (existing.status === "approved" || existing.status === "rejected")) {
      if (typeof fields.merchantVpa === "string") {
        existing.merchantVpa = fields.merchantVpa;
      }
      if (typeof fields.reimbursementNote === "string") {
        existing.reimbursementNote = fields.reimbursementNote;
      }
      if (typeof fields.policyWarning === "string") {
        existing.policyWarning = fields.policyWarning;
      }
      if (typeof fields.warningAcknowledged === "boolean") {
        existing.warningAcknowledged = fields.warningAcknowledged;
      }
      if (fields.mobileLocation !== undefined) {
        existing.mobileLocation = fields.mobileLocation;
      }
      if (Array.isArray(fields.mobileReceipts)) {
        existing.mobileReceipts = fields.mobileReceipts;
      }
      if (typeof fields.lastSyncedFromMobileAt === "string") {
        existing.lastSyncedFromMobileAt = fields.lastSyncedFromMobileAt;
      }
      existing.timeline.push(syncEvent);
      await existing.save();
      return res.json({ ok: true, backendId: existing.id });
    }

    if (existing) {
      Object.assign(existing, fields);
      existing.timeline.push(syncEvent);
      await existing.save();
      return res.json({ ok: true, backendId: existing.id });
    }

    const created = new Transaction({
      ...fields,
      timeline: [syncEvent]
    });
    await created.save();
    res.json({ ok: true, backendId: created.id });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

router.patch("/mobile/transactions/:id", mobileDeviceAuth, async (req: MobileRequest, res) => {
  try {
    const idParam = req.params["id"];
    const transactionId = Array.isArray(idParam) ? idParam[0] : idParam;
    if (!transactionId) {
      return res.status(400).json({ ok: false, message: "Missing transaction id" });
    }

    const body = req.body as {
      employeeId?: string;
      status?: string;
      reimbursementPurpose?: string;
      reimbursementNote?: string;
      receipts?: MobileTransactionPayload["receipts"];
      location?: MobileTransactionPayload["location"];
      employeeName?: string;
      department?: string;
    };

    if (req.mobileEmployeeId && body.employeeId && req.mobileEmployeeId !== body.employeeId) {
      return res.status(403).json({ ok: false, message: "employeeId does not match token" });
    }

    const tx = await Transaction.findOne({ id: transactionId }).exec();
    if (!tx) {
      return res.status(404).json({ ok: false, message: "Transaction not found" });
    }

    if (req.mobileEmployeeId && tx.employeeId !== req.mobileEmployeeId) {
      return res.status(403).json({ ok: false, message: "Not allowed to update this transaction" });
    }

    const empStill = await Employee.findOne({ id: tx.employeeId }).exec();
    if (!empStill) {
      return res.status(404).json({ ok: false, message: "Employee context missing" });
    }

    if (body.status) {
      tx.status = mapMobileStatusToDashboard(body.status);
    }
    if (body.reimbursementPurpose?.trim()) {
      tx.purposeCategory = body.reimbursementPurpose.trim();
    }
    if (body.reimbursementNote !== undefined) {
      tx.reimbursementNote = body.reimbursementNote;
    }
    if (body.receipts) {
      tx.mobileReceipts = body.receipts;
    }
    if (body.location !== undefined) {
      tx.mobileLocation = body.location;
    }

    tx.lastSyncedFromMobileAt = dayjs().toISOString();
    tx.timeline.push({
      id: `mob-${Date.now().toString(36)}`,
      actor: "Employee app",
      action: "Updated from mobile (patch)",
      timestamp: dayjs().toISOString()
    });
    await tx.save();
    res.json({ ok: true, backendId: tx.id });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

// --- ADMIN (JWT + active AdminUser record) ---
router.use("/admin", authMiddleware, requireAdminUser);

router.get("/admin/bootstrap", async (req, res) => {
  try {
    const [txBlock, employees, policies, alertsConfigArr, admins, billingArr, exportAudits] =
      await Promise.all([
        listTransactionsFromQuery(req.query as Record<string, string | string[] | undefined>, { bootstrapDefaultLimit: getDefaultBootstrapTxLimit() }),
        Employee.find().exec(),
        ExpensePolicy.find().exec(),
        AlertConfig.find().exec(),
        AdminUser.find().exec(),
        BillingPlan.find().exec(),
        ExportAudit.find().sort({ exportedAt: -1 }).exec()
      ]);

    res.json({
      ...txBlock,
      employees,
      policies,
      alertsConfig:
        alertsConfigArr[0] || {
          delivery: "both",
          threshold: "daily_digest",
          mutedPolicies: [],
          mutedEmployees: []
        },
      admins,
      billing:
        billingArr[0] || {
          plan: "Basic",
          billingCycle: "monthly",
          nextRenewal: dayjs().add(1, "month").format("YYYY-MM-DD"),
          licenses: 0,
          headcount: 0
        },
      exportAudits
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get("/admin/transactions", async (req, res) => {
  try {
    const { transactions, transactionPage, transactionPageSize, transactionTotal, hasMoreTransactions } =
      await listTransactionsFromQuery({ ...req.query } as Record<string, string | string[] | undefined>, {});
    res.json({ transactions, transactionPage, transactionPageSize, transactionTotal, hasMoreTransactions });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/** ADM-001: one-day spend totals and category mix */
router.get("/admin/analytics/daily-spend", R_ANAL, async (req, res) => {
  try {
    const d = req.query["date"];
    const dateStr = Array.isArray(d) ? d[0] : d;
    const data = await getDailySpend(typeof dateStr === "string" ? dateStr : undefined);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/** ADM-006: KPIs, category / employee / timeline breakdowns */
router.get("/admin/analytics/aggregated", R_ANAL, async (req, res) => {
  try {
    const start = req.query["startDate"];
    const end = req.query["endDate"];
    const b = req.query["timelineBucket"];
    const startDate = (Array.isArray(start) ? start[0] : start) as string | undefined;
    const endDate = (Array.isArray(end) ? end[0] : end) as string | undefined;
    const raw = (Array.isArray(b) ? b[0] : b) as string | undefined;
    const bucket: TimelineBucket =
      raw === "weekly" || raw === "monthly" ? raw : "daily";
    const data = await getAggregated(startDate, endDate, bucket);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/** ADM-003: simulate a policy over stored transactions (policy effective dates apply in-engine) */
router.post("/admin/policies/preview", R_FIN, async (req, res) => {
  try {
    const policy = req.body as PolicyPreviewBody;
    if (!policy || typeof policy !== "object") {
      return res.status(400).json({ error: "Policy body required" });
    }
    if (!policy.id && !policy.name) {
      return res.status(400).json({ error: "Policy id or name is required" });
    }
    const txs = await Transaction.find({}).lean();
    const preview = runPolicyPreview(txs, policy);
    res.json({ ok: true, ...preview });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/admin/transactions/approve", R_FIN, async (req, res) => {
  const { transactionId, amount } = req.body;
  try {
    const tx = await Transaction.findOne({ id: transactionId });
    if (!tx) return res.status(404).json({ error: "Not found" });

    const actor = req.adminUser?.name || "Admin";
    tx.status = "approved";
    tx.claimedAmount = amount;
    tx.adminDecision = amount === tx.amount ? "Approved in full" : `Partial approval Rs.${amount}`;
    tx.adminDecisionAt = dayjs().toISOString();
    tx.timeline.push(
      { id: `${tx.id}-review`, actor, action: "Admin reviewed", timestamp: dayjs().toISOString() },
      { id: `${tx.id}-approve`, actor, action: `Approved Rs.${amount}`, timestamp: dayjs().toISOString() }
    );
    await tx.save();
    res.json({ ok: true, transactionId, amount, processedAt: dayjs().toISOString() });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/admin/transactions/reject", R_FIN, async (req, res) => {
  const { transactionId, reason } = req.body;
  try {
    const tx = await Transaction.findOne({ id: transactionId });
    if (!tx) return res.status(404).json({ error: "Not found" });

    const actor = req.adminUser?.name || "Admin";
    tx.status = "rejected";
    tx.adminDecision = `Rejected - ${reason}`;
    tx.adminDecisionAt = dayjs().toISOString();
    tx.timeline.push(
      { id: `${tx.id}-review`, actor, action: "Admin reviewed", timestamp: dayjs().toISOString() },
      { id: `${tx.id}-reject`, actor, action: `Rejected (${reason})`, timestamp: dayjs().toISOString() }
    );
    await tx.save();
    res.json({ ok: true, transactionId, reason, processedAt: dayjs().toISOString() });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/admin/transactions/bulk", R_FIN, async (req, res) => {
  const { ids, decision, reason } = req.body;
  try {
    const txs = await Transaction.find({ id: { $in: ids } });
    const actor = req.adminUser?.name || "Admin";
    for (const tx of txs) {
      if (decision === "approved") {
        tx.status = "approved";
        tx.adminDecision = "Bulk approved";
      } else {
        tx.status = "rejected";
        tx.adminDecision = `Bulk rejected - ${reason || "Policy violation"}`;
      }
      tx.adminDecisionAt = dayjs().toISOString();
      tx.timeline.push({
        id: `${tx.id}-bulk`,
        actor,
        action: `Bulk ${decision}`,
        timestamp: dayjs().toISOString()
      });
      await tx.save();
    }
    res.json({ ok: true, ids, decision, reason, processedAt: dayjs().toISOString() });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post(
  "/admin/transactions/:id/receipt",
  R_FIN,
  upload.single("receipt"),
  async (req, res) => {
    try {
      const rawId = req.params["id"];
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "Missing transaction id" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const tx = await Transaction.findOne({ id });
      if (!tx) {
        return res.status(404).json({ error: "Not found" });
      }
      const receiptUrl = await uploadFile(
        req.file.buffer,
        id,
        req.file.mimetype,
        req.file.originalname
      );
      tx.receiptUrl = receiptUrl;
      await tx.save();
      res.json({ ok: true, transactionId: id, receiptUrl });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

router.post("/admin/policies", R_FIN, async (req, res) => {
  try {
    const policy = new ExpensePolicy(req.body);
    await policy.save();
    res.json({ ok: true, policy });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/admin/employees/import", R_HR, async (req, res) => {
  const { csvText } = req.body as { csvText?: string };
  if (csvText == null || String(csvText).trim() === "") {
    return res.status(400).json({ error: "csvText required" });
  }
  const lines = String(csvText).trim().split(/\n/);
  if (lines.length < 2) {
    return res.json({ ok: true, created: [], skipped: 0, errors: ["No data rows"] });
  }
  const header = lines[0]!.split(",").map((c) => c.trim().toLowerCase());
  const idx = (h: string) => header.indexOf(h);
  const I = {
    id: idx("id"),
    name: idx("name"),
    email: idx("email"),
    department: idx("department"),
    role: idx("role")
  };
  if (I.email < 0) {
    return res.status(400).json({ error: "CSV must include an email column" });
  }
  const created: object[] = [];
  const errors: string[] = [];
  let skipped = 0;
  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r]!.split(",").map((c) => c.trim());
    const email = I.email >= 0 ? cells[I.email] : "";
    if (!email) {
      errors.push(`Row ${r + 1}: missing email`);
      continue;
    }
    const id = I.id >= 0 && cells[I.id!] ? cells[I.id!]! : `EMP-I-${Date.now()}-${r}`;
    const name = I.name >= 0 && cells[I.name!] ? cells[I.name!]! : email.split("@")[0]! || "User";
    const department =
      I.department >= 0 && cells[I.department!] ? cells[I.department!]! : "Unassigned";
    const roleRec =
      I.role >= 0 && cells[I.role!] ? (cells[I.role!]! === "manager" ? "manager" : "employee") : "employee";
    const dupe = await Employee.findOne({ email: email.toLowerCase() });
    if (dupe) {
      skipped += 1;
      continue;
    }
    try {
      const emp = await Employee.create({
        id,
        name,
        email: email.toLowerCase(),
        department,
        role: roleRec,
        active: true,
        onboarded: false,
        travelApproved: false
      });
      const o = emp.toObject() as unknown as Record<string, unknown>;
      delete o._id;
      delete o.__v;
      created.push(o);
    } catch (e) {
      errors.push(`Row ${r + 1}: ${(e as Error).message}`);
    }
  }
  res.json({ ok: true, created, skipped, errors, createdCount: created.length });
});

router.post("/admin/employees/invite", R_HR, async (req, res) => {
  const { email, department, name: nameIn } = req.body as {
    email?: string;
    department?: string;
    name?: string;
  };
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: "email required" });
  }
  const em = String(email).trim().toLowerCase();
  if (await Employee.findOne({ email: em })) {
    return res.status(400).json({ error: "Employee with this email already exists" });
  }
  const id = `EMP-INV-${Date.now().toString(36)}`;
  const name = (nameIn && String(nameIn).trim()) || em.split("@")[0] || "User";
  const departmentVal = (department && String(department).trim()) || "Unassigned";
  const inviteToken = randomBytes(24).toString("hex");
  const emp = await Employee.create({
    id,
    name,
    email: em,
    department: departmentVal,
    role: "employee",
    active: true,
    onboarded: false,
    travelApproved: false,
    inviteToken
  });
  const o = emp.toObject() as unknown as Record<string, unknown>;
  delete o._id;
  delete o.__v;
  res.json({ ok: true, employee: o });
});

router.patch("/admin/alerts", R_FIN, async (req, res) => {
  try {
    let alert = await AlertConfig.findOne();
    if (!alert) alert = new AlertConfig();
    Object.assign(alert, req.body);
    await alert.save();
    res.json({ ok: true, config: alert });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.patch("/admin/billing", R_BILL, async (req, res) => {
  try {
    let bill = await BillingPlan.findOne();
    if (!bill) bill = new BillingPlan();
    Object.assign(bill, req.body);
    await bill.save();
    res.json({ ok: true, plan: bill.plan });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put("/admin/users", R_ADM, async (req, res) => {
  try {
    const admin = await AdminUser.findOneAndUpdate({ id: req.body.id }, req.body, {
      upsert: true,
      new: true
    });
    res.json({ ok: true, admin });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/admin/users/:id/toggle", R_ADM, async (req, res) => {
  try {
    const rawId = req.params["id"];
    const paramId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!paramId) {
      return res.status(400).json({ error: "Missing id" });
    }
    const admin = await AdminUser.findOne({ id: String(paramId) });
    if (admin) {
      admin.active = !admin.active;
      await admin.save();
    }
    res.json({ ok: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/admin/exports", R_EX, async (req, res) => {
  try {
    const payload = req.body;
    const actor = req.adminUser?.name || "Admin";
    const exp = new ExportAudit({
      id: `EXP-${Date.now()}`,
      actor,
      ...payload,
      exportedAt: dayjs().toISOString()
    });
    await exp.save();
    res.json({ ok: true, payload });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
