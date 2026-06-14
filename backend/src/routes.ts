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
import { registerEmployeeRoutes } from "./employeeRoutes";
import { registerMobileOnboardingRoutes } from "./mobileOnboardingRoutes";
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
import {
  canSubmitReimbursement,
  mergeMobileSyncFields,
  reimbursementBlockedMessage
} from "./services/paymentFieldGuard";
import {
  confirmRazorpayPayment,
  createRazorpayOrder,
  markCheckoutOpened
} from "./services/razorpayService";
import { type PaymentStatus } from "./services/razorpayConfig";
import {
  employeeIdIsAssigned,
  findActiveEmployeeByEmail,
  findEmployeeByLoginId,
  getNextEmployeeSerialId,
  isSerialEmployeeId,
  makePendingEmployeeId,
  normalizeSerialEmployeeId,
} from "./utils/employeeSerialId";
import {
  ensureEmployeeInviteCode,
  generateUniqueInviteCode,
} from "./utils/inviteCode";

const router = express.Router();

function formatEmployeeDoc(emp: { toObject: () => Record<string, unknown> }) {
  const o = emp.toObject() as Record<string, unknown>;
  delete o._id;
  delete o.__v;
  return o;
}
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
    (req as express.Request & { user?: Record<string, unknown> }).user = decoded as Record<
      string,
      unknown
    >;
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

router.post("/auth/employee/register", async (req, res) => {
  try {
    const { email, password, fullName, department, name, employeeId: employeeIdIn } = req.body as {
      email?: string;
      password?: string;
      fullName?: string;
      department?: string;
      name?: string;
      employeeId?: string;
    };
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const displayName = String(fullName || name || "").trim();
    const rawEmployeeId = String(employeeIdIn || "").trim();

    if (!normalizedEmail) {
      return res.status(400).json({ ok: false, message: "Work email is required." });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ ok: false, message: "Password must be at least 8 characters." });
    }

    const existingAuth = await AuthUser.findOne({ email: normalizedEmail });
    if (existingAuth) {
      const linkedEmp = await Employee.findOne({ email: normalizedEmail, active: true }).exec();
      if (linkedEmp && employeeIdIsAssigned(linkedEmp)) {
        const idHint = rawEmployeeId && normalizeSerialEmployeeId(rawEmployeeId) !== linkedEmp.id
          ? ` Your assigned ID is ${linkedEmp.id}.`
          : "";
        return res.status(400).json({
          ok: false,
          code: "ALREADY_REGISTERED",
          employeeId: linkedEmp.id,
          message: `You already completed registration.${idHint} Log in with Employee ID ${linkedEmp.id} and the password you set earlier (not a new password here).`,
        });
      }
      return res.status(400).json({
        ok: false,
        code: "ALREADY_REGISTERED_PENDING",
        message:
          "You already registered with this email. Wait for your admin to assign an Employee ID, then log in with that ID and your original password.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(password), salt);
    const createdAt = new Date().toISOString();

    /** Admin assigned emp1 — employee completes registration with ID + email + password. */
    if (rawEmployeeId) {
      const emp = await findEmployeeByLoginId(rawEmployeeId);
      if (!emp || !employeeIdIsAssigned(emp)) {
        return res.status(400).json({
          ok: false,
          message: "Invalid Employee ID, or your admin has not assigned one yet.",
        });
      }
      if (emp.email !== normalizedEmail) {
        return res.status(400).json({
          ok: false,
          message: "This email does not match the Employee ID. Use the email your admin has on file.",
        });
      }
      const nameForAccount = displayName || emp.name;
      await AuthUser.create({
        id: `usr_${Date.now().toString(36)}`,
        email: normalizedEmail,
        fullName: nameForAccount,
        companyName: "—",
        companySize: "—",
        monthlySpend: "—",
        companyType: "—",
        passwordHash,
        createdAt,
      });
      if (displayName && displayName !== emp.name) {
        emp.name = displayName;
        await emp.save();
      }
      return res.json({
        ok: true,
        ready: true,
        employeeId: emp.id,
        message: `Account ready. Log in with Employee ID ${emp.id} and your password.`,
      });
    }

    if (!displayName) {
      return res.status(400).json({ ok: false, message: "Full name is required." });
    }

    let employeeRecord = await Employee.findOne({ email: normalizedEmail, active: true });
    if (employeeRecord && employeeIdIsAssigned(employeeRecord)) {
      return res.status(400).json({
        ok: false,
        code: "COMPLETE_REGISTRATION",
        employeeId: employeeRecord.id,
        message: `You already have Employee ID ${employeeRecord.id}. Complete registration using your ID and set a password below.`,
      });
    }

    await AuthUser.create({
      id: `usr_${Date.now().toString(36)}`,
      email: normalizedEmail,
      fullName: displayName,
      companyName: "—",
      companySize: "—",
      monthlySpend: "—",
      companyType: "—",
      passwordHash,
      createdAt,
    });

    if (!employeeRecord) {
      employeeRecord = await Employee.create({
        id: makePendingEmployeeId(),
        name: displayName,
        email: normalizedEmail,
        department: String(department || "").trim() || "Unassigned",
        role: "employee",
        active: true,
        onboarded: false,
        idAssigned: false,
        travelApproved: false,
      });
    } else {
      employeeRecord.name = displayName;
      if (department?.trim()) employeeRecord.department = department.trim();
      await employeeRecord.save();
    }

    res.json({
      ok: true,
      pending: true,
      message:
        "Your admin will assign your Employee ID. You can log in once you receive it (e.g. emp1).",
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password, employeeId, portal } = req.body as {
      email?: string;
      password?: string;
      employeeId?: string;
      portal?: "admin" | "employee";
    };
    const loginPortal = portal === "employee" ? "employee" : "admin";

    let normalizedEmail = String(email || "").trim().toLowerCase();
    let employeeRecord: InstanceType<typeof Employee> | null = null;
    let user: InstanceType<typeof AuthUser> | null = null;

     if (loginPortal === "employee") {
      const rawId = String(employeeId || "").trim();
      if (!rawId) {
        return res.status(400).json({ ok: false, message: "Employee ID is required (e.g. emp1)." });
      }
      employeeRecord = await findEmployeeByLoginId(rawId);
      if (!employeeRecord) {
        return res.status(400).json({ ok: false, message: "No employee found with that ID." });
      }
      if (!employeeIdIsAssigned(employeeRecord)) {
        return res.status(403).json({
          ok: false,
          message: "Your Employee ID has not been assigned yet. Ask your admin to assign one.",
          code: "PENDING_ID",
        });
      }
      normalizedEmail = employeeRecord.email;
      user = await AuthUser.findOne({ email: normalizedEmail });
      if (!user) {
        return res.status(400).json({
          ok: false,
          code: "NEED_PASSWORD_SETUP",
          employeeId: employeeRecord.id,
          employeeEmail: employeeRecord.email,
          message: `No password set yet for ${employeeRecord.id}. Go to Employee registration → "I have my Employee ID", enter ${employeeRecord.id}, your work email (${employeeRecord.email}), and choose a password.`,
        });
      }
    } else {
      if (!normalizedEmail) {
        return res.status(400).json({ ok: false, message: "Email is required." });
      }
      user = await AuthUser.findOne({ email: normalizedEmail });
      if (!user) {
        return res.status(400).json({ ok: false, message: "No account found." });
      }
    }

    const isMatch = await bcrypt.compare(String(password || ""), user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ ok: false, message: "Incorrect password." });
    }

    const adminRecord = await AdminUser.findOne({ email: normalizedEmail, active: true });
    if (!employeeRecord) {
      employeeRecord = await Employee.findOne({ email: normalizedEmail, active: true });
    }

    if (loginPortal === "admin") {
      if (!adminRecord) {
        return res.status(403).json({
          ok: false,
          message: "This account does not have admin access. Try logging in as Employee.",
          code: "NOT_ADMIN",
        });
      }
    } else if (!employeeRecord) {
      return res.status(403).json({
        ok: false,
        message: "This account is not linked to an employee profile. Ask HR to invite you.",
        code: "NOT_EMPLOYEE",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: normalizedEmail,
        portal: loginPortal,
        employeeId: employeeRecord?.id,
        adminId: adminRecord?.id,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const userPayload = { ...user.toObject() } as Record<string, unknown>;
    delete userPayload.passwordHash;
    delete userPayload._id;
    delete userPayload.__v;
    userPayload["portal"] = loginPortal;

    if (adminRecord) {
      userPayload["adminId"] = adminRecord.id;
      userPayload["adminRole"] = adminRecord.role;
    }
    if (employeeRecord) {
      userPayload["employeeId"] = employeeRecord.id;
      userPayload["employeeName"] = employeeRecord.name;
      userPayload["employeeDepartment"] = employeeRecord.department;
      userPayload["employeeRole"] = employeeRecord.role;
    }

    res.json({ ok: true, user: userPayload, token });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

// --- MOBILE (AllpayEmployeeApp) — onboarding + sync ---
registerMobileOnboardingRoutes(router);

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

router.post("/mobile/payments/create-order", mobileDeviceAuth, async (req: MobileRequest, res) => {
  try {
    const body = req.body as {
      txId?: string;
      amount?: number;
      employeeId?: string;
      merchant?: {
        vpa?: string;
        name?: string;
        category?: string;
        mcc?: string;
        amount?: number;
      };
      upiApp?: string;
      employeeName?: string;
      department?: string;
    };

    const txId = body.txId?.trim();
    const employeeId = body.employeeId?.trim();
    if (!txId || !employeeId || !body.merchant?.vpa) {
      return res.status(400).json({
        ok: false,
        message: "txId, employeeId, and merchant.vpa are required"
      });
    }
    if (req.mobileEmployeeId && req.mobileEmployeeId !== employeeId) {
      return res.status(403).json({ ok: false, message: "employeeId does not match token" });
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, message: "Valid amount is required" });
    }

    const syncOverrides: { employeeName?: string; department?: string } = {};
    if (body.employeeName?.trim()) syncOverrides.employeeName = body.employeeName.trim();
    if (body.department?.trim()) syncOverrides.department = body.department.trim();
    const resolved = await resolveEmployeeForMobileSync(employeeId, syncOverrides);
    if (!resolved) {
      return res.status(404).json({ ok: false, message: "Employee not found" });
    }

    const result = await createRazorpayOrder({
      txId,
      amount,
      employeeId,
      employeeName: resolved.name,
      department: resolved.department,
      merchant: {
        vpa: body.merchant.vpa,
        name: body.merchant.name ?? "Unknown",
        category: body.merchant.category ?? "office",
        mcc: body.merchant.mcc ?? "5999",
        ...(body.merchant.amount != null ? { amount: body.merchant.amount } : {}),
      },
      ...(body.upiApp?.trim() ? { upiApp: body.upiApp.trim() } : {}),
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    const statusCode = (error as Error & { statusCode?: number }).statusCode;
    if (statusCode === 409) {
      return res.status(409).json({ ok: false, message: (error as Error).message });
    }
    if ((error as Error).message.includes("Razorpay")) {
      return res.status(502).json({ ok: false, message: (error as Error).message });
    }
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

router.post("/mobile/payments/confirm", mobileDeviceAuth, async (req: MobileRequest, res) => {
  try {
    const body = req.body as {
      txId?: string;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };
    if (!body.txId || !body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
      return res.status(400).json({
        ok: false,
        message: "txId, razorpay_order_id, razorpay_payment_id, and razorpay_signature are required"
      });
    }

    const tx = await confirmRazorpayPayment({
      txId: body.txId,
      razorpay_order_id: body.razorpay_order_id,
      razorpay_payment_id: body.razorpay_payment_id,
      razorpay_signature: body.razorpay_signature
    });

    if (req.mobileEmployeeId && req.mobileEmployeeId !== tx.employeeId) {
      return res.status(403).json({ ok: false, message: "Not allowed" });
    }

    res.json({
      ok: true,
      paymentStatus: tx.paymentStatus,
      razorpayPaymentId: tx.razorpayPaymentId
    });
  } catch (error) {
    const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 500;
    res.status(statusCode).json({ ok: false, message: (error as Error).message });
  }
});

router.post("/mobile/payments/checkout-opened", mobileDeviceAuth, async (req: MobileRequest, res) => {
  try {
    const txId = (req.body as { txId?: string }).txId?.trim();
    if (!txId) {
      return res.status(400).json({ ok: false, message: "txId is required" });
    }
  const tx = await Transaction.findOne({ id: txId }).exec();
    if (!tx) {
      return res.status(404).json({ ok: false, message: "Transaction not found" });
    }
    if (req.mobileEmployeeId && req.mobileEmployeeId !== tx.employeeId) {
      return res.status(403).json({ ok: false, message: "Not allowed" });
    }
    await markCheckoutOpened(txId);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

router.get("/mobile/transactions/:id/payment-status", mobileDeviceAuth, async (req: MobileRequest, res) => {
  try {
    const idParam = req.params["id"];
    const transactionId = Array.isArray(idParam) ? idParam[0] : idParam;
    if (!transactionId) {
      return res.status(400).json({ ok: false, message: "Missing transaction id" });
    }
    const tx = await Transaction.findOne({ id: transactionId }).exec();
    if (!tx) {
      return res.status(404).json({ ok: false, message: "Transaction not found" });
    }
    if (req.mobileEmployeeId && req.mobileEmployeeId !== tx.employeeId) {
      return res.status(403).json({ ok: false, message: "Not allowed" });
    }
    res.json({
      ok: true,
      paymentStatus: tx.paymentStatus ?? "draft",
      razorpayPaymentId: tx.razorpayPaymentId ?? null,
      razorpayOrderId: tx.razorpayOrderId ?? null,
      expenseStatus: tx.status
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

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
      const merged = mergeMobileSyncFields(existing, fields);
      Object.assign(existing, merged);
      existing.timeline.push(syncEvent);
      await existing.save();
      return res.json({
        ok: true,
        backendId: existing.id,
        paymentStatus: existing.paymentStatus,
        razorpayPaymentId: existing.razorpayPaymentId ?? null
      });
    }

    const created = new Transaction({
      ...fields,
      timeline: [syncEvent]
    });
    await created.save();
    res.json({
      ok: true,
      backendId: created.id,
      paymentStatus: created.paymentStatus,
      razorpayPaymentId: created.razorpayPaymentId ?? null
    });
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
      if (
        body.status === "Pending Approval" &&
        !canSubmitReimbursement(tx.paymentStatus as PaymentStatus | undefined)
      ) {
        return res.status(409).json({
          ok: false,
          message: reimbursementBlockedMessage(tx.paymentStatus as PaymentStatus | undefined)
        });
      }
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
    const hasExplicitId = I.id >= 0 && Boolean(cells[I.id!]);
    const id = hasExplicitId ? cells[I.id!]! : makePendingEmployeeId();
    const name = I.name >= 0 && cells[I.name!] ? cells[I.name!]! : email.split("@")[0]! || "User";
    const department =
      I.department >= 0 && cells[I.department!] ? cells[I.department!]! : "Unassigned";
    const roleRec =
      I.role >= 0 && cells[I.role!] ? (cells[I.role!]! === "manager" ? "manager" : "employee") : "employee";
    const idAssigned = hasExplicitId;
    const dupe = await Employee.findOne({ email: email.toLowerCase() });
    if (dupe) {
      skipped += 1;
      continue;
    }
    try {
      const emp = await Employee.create({
        id: idAssigned && isSerialEmployeeId(id) ? normalizeSerialEmployeeId(id) : id,
        name,
        email: email.toLowerCase(),
        department,
        role: roleRec,
        active: true,
        onboarded: idAssigned,
        idAssigned,
        travelApproved: false
      });
      await ensureEmployeeInviteCode(emp);
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
  const name = (nameIn && String(nameIn).trim()) || em.split("@")[0] || "User";
  const departmentVal = (department && String(department).trim()) || "Unassigned";
  const inviteToken = randomBytes(24).toString("hex");
  const inviteCode = await generateUniqueInviteCode();
  const emp = await Employee.create({
    id: makePendingEmployeeId(),
    name,
    email: em,
    department: departmentVal,
    role: "employee",
    active: true,
    onboarded: false,
    idAssigned: false,
    travelApproved: false,
    inviteToken,
    inviteCode,
  });
  res.json({
    ok: true,
    employee: formatEmployeeDoc(emp),
    inviteCode,
    message: `Employee invited. Share invite code ${inviteCode} for the mobile app.`,
  });
});

router.get("/admin/employees/pending-id", R_HR, async (_req, res) => {
  try {
    const rows = await Employee.find({ active: true, idAssigned: false }).sort({ name: 1 }).exec();
    res.json({ ok: true, employees: rows.map((emp) => formatEmployeeDoc(emp)) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/admin/employees/assign-id", R_HR, async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    const em = String(email || "").trim().toLowerCase();
    if (!em) {
      return res.status(400).json({ error: "email is required" });
    }
    const emp = await Employee.findOne({ email: em, active: true });
    if (!emp) {
      return res.status(404).json({ error: "Employee not found" });
    }
    if (employeeIdIsAssigned(emp)) {
      return res.status(400).json({ error: "Employee already has an assigned ID", employeeId: emp.id });
    }

    const newId = await getNextEmployeeSerialId();
    emp.id = newId;
    emp.idAssigned = true;
    emp.onboarded = true;
    if (!emp.inviteToken) {
      emp.inviteToken = randomBytes(24).toString("hex");
    }
    const inviteCode = await ensureEmployeeInviteCode(emp);
    await emp.save();

    res.json({
      ok: true,
      employeeId: newId,
      inviteCode,
      message: `Assigned ${newId}. Share invite code ${inviteCode} for the mobile app, or use web registration with Employee ID ${newId}.`,
      employee: formatEmployeeDoc(emp),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/admin/employees/reset-login", R_HR, async (req, res) => {
  try {
    const { email, employeeId } = req.body as { email?: string; employeeId?: string };
    let emp = null;
    if (employeeId?.trim()) {
      emp = await findEmployeeByLoginId(employeeId);
    }
    if (!emp && email?.trim()) {
      emp = await findActiveEmployeeByEmail(email);
    }
    if (!emp) {
      return res.status(400).json({ error: "email or employeeId is required" });
    }
    if (!employeeIdIsAssigned(emp)) {
      return res.status(400).json({ error: "Assign an Employee ID before resetting login" });
    }
    const authEmail = String(emp.email).trim().toLowerCase();
    const deleted = await AuthUser.deleteOne({ email: authEmail });
    res.json({
      ok: true,
      employeeId: emp.id,
      hadLogin: deleted.deletedCount > 0,
      message: deleted.deletedCount
        ? `Login cleared for ${emp.id}. Employee can set a new password under Register → "I have my Employee ID".`
        : `No login existed for ${emp.id}. Employee should use Register → "I have my Employee ID" to set a password.`,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/admin/employees/generate-invite-code", R_HR, async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    const em = String(email || "").trim().toLowerCase();
    if (!em) {
      return res.status(400).json({ error: "email is required" });
    }
    const emp = await Employee.findOne({ email: em, active: true });
    if (!emp) {
      return res.status(404).json({ error: "Employee not found" });
    }
    emp.inviteCode = await generateUniqueInviteCode();
    if (!emp.inviteToken) {
      emp.inviteToken = randomBytes(24).toString("hex");
    }
    await emp.save();
    res.json({
      ok: true,
      inviteCode: emp.inviteCode,
      employee: formatEmployeeDoc(emp),
      message: `Invite code ${emp.inviteCode} ready for the mobile app.`,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
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

registerEmployeeRoutes(router, authMiddleware, upload);

export default router;
