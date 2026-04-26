import express from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dayjs from 'dayjs';
import {
  AuthUser,
  Employee,
  Transaction,
  ExpensePolicy,
  AlertConfig,
  AdminUser,
  BillingPlan,
  ExportAudit
} from './models';
import { uploadFile } from './services/s3Service';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});
const JWT_SECRET = process.env.JWT_SECRET || 'allpay_super_secret';

// Middleware to verify JWT
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// --- AUTH ROUTES ---
router.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, ...rest } = req.body;
    const normalizedEmail = email.trim().toLowerCase();
    
    const existing = await AuthUser.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ ok: false, message: 'Account already exists.' });
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
    
    const token = jwt.sign({ id, email: normalizedEmail }, JWT_SECRET, { expiresIn: '7d' });
    
    const userPayload = { ...newUser.toObject() };
    delete userPayload.passwordHash;
    delete userPayload._id;
    delete userPayload.__v;

    res.json({ ok: true, user: userPayload, token });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();
    
    const user = await AuthUser.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ ok: false, message: 'No account found.' });
    }
    
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ ok: false, message: 'Incorrect password.' });
    }
    
    const token = jwt.sign({ id: user.id, email: normalizedEmail }, JWT_SECRET, { expiresIn: '7d' });
    
    const userPayload = { ...user.toObject() };
    delete userPayload.passwordHash;
    delete userPayload._id;
    delete userPayload.__v;

    res.json({ ok: true, user: userPayload, token });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

// --- ADMIN ROUTES ---
router.use('/admin', authMiddleware); // Protect all admin routes

router.get('/admin/bootstrap', async (req, res) => {
  try {
    const [
      transactions,
      employees,
      policies,
      alertsConfigArr,
      admins,
      billingArr,
      exportAudits
    ] = await Promise.all([
      Transaction.find().sort({ dateTime: -1 }).limit(350),
      Employee.find(),
      ExpensePolicy.find(),
      AlertConfig.find(),
      AdminUser.find(),
      BillingPlan.find(),
      ExportAudit.find().sort({ exportedAt: -1 })
    ]);

    const formatDoc = (doc: any) => {
      const obj = doc.toObject();
      // map isNewTx back to isNew for frontend
      if (obj.isNewTx !== undefined) {
        obj.isNew = obj.isNewTx;
        delete obj.isNewTx;
      }
      return obj;
    };

    res.json({
      transactions: transactions.map(formatDoc),
      employees,
      policies,
      alertsConfig: alertsConfigArr[0] || { delivery: 'both', threshold: 'daily_digest', mutedPolicies: [], mutedEmployees: [] },
      admins,
      billing: billingArr[0] || { plan: 'Basic', billingCycle: 'monthly', nextRenewal: dayjs().add(1, 'month').format('YYYY-MM-DD'), licenses: 0, headcount: 0 },
      exportAudits
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/admin/transactions/approve', async (req, res) => {
  const { transactionId, amount } = req.body;
  try {
    const tx = await Transaction.findOne({ id: transactionId });
    if (!tx) return res.status(404).json({ error: 'Not found' });
    
    tx.status = 'approved';
    tx.claimedAmount = amount;
    tx.adminDecision = amount === tx.amount ? 'Approved in full' : `Partial approval Rs.${amount}`;
    tx.adminDecisionAt = dayjs().toISOString();
    tx.timeline.push(
      { id: `${tx.id}-review`, actor: 'Finance Admin', action: 'Admin reviewed', timestamp: dayjs().toISOString() },
      { id: `${tx.id}-approve`, actor: 'Finance Admin', action: `Approved Rs.${amount}`, timestamp: dayjs().toISOString() }
    );
    await tx.save();
    res.json({ ok: true, transactionId, amount, processedAt: dayjs().toISOString() });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/admin/transactions/reject', async (req, res) => {
  const { transactionId, reason } = req.body;
  try {
    const tx = await Transaction.findOne({ id: transactionId });
    if (!tx) return res.status(404).json({ error: 'Not found' });
    
    tx.status = 'rejected';
    tx.adminDecision = `Rejected - ${reason}`;
    tx.adminDecisionAt = dayjs().toISOString();
    tx.timeline.push(
      { id: `${tx.id}-review`, actor: 'Finance Admin', action: 'Admin reviewed', timestamp: dayjs().toISOString() },
      { id: `${tx.id}-reject`, actor: 'Finance Admin', action: `Rejected (${reason})`, timestamp: dayjs().toISOString() }
    );
    await tx.save();
    res.json({ ok: true, transactionId, reason, processedAt: dayjs().toISOString() });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/admin/transactions/bulk', async (req, res) => {
  const { ids, decision, reason } = req.body;
  try {
    const txs = await Transaction.find({ id: { $in: ids } });
    for (const tx of txs) {
      if (decision === 'approved') {
        tx.status = 'approved';
        tx.adminDecision = 'Bulk approved';
      } else {
        tx.status = 'rejected';
        tx.adminDecision = `Bulk rejected - ${reason || 'Policy violation'}`;
      }
      tx.adminDecisionAt = dayjs().toISOString();
      tx.timeline.push({
        id: `${tx.id}-bulk`,
        actor: 'Finance Admin',
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
  '/admin/transactions/:id/receipt',
  upload.single('receipt'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const tx = await Transaction.findOne({ id });
      if (!tx) {
        return res.status(404).json({ error: 'Not found' });
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

router.post('/admin/policies', async (req, res) => {
  try {
    const policy = new ExpensePolicy(req.body);
    await policy.save();
    res.json({ ok: true, policy });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/admin/employees/import', async (req, res) => {
  // simple mock for now, actual logic in frontend creates them and we could bulk insert here
  res.json({ ok: true });
});

router.post('/admin/employees/invite', async (req, res) => {
  res.json({ ok: true });
});

router.patch('/admin/alerts', async (req, res) => {
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

router.patch('/admin/billing', async (req, res) => {
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

router.put('/admin/users', async (req, res) => {
  try {
    const admin = await AdminUser.findOneAndUpdate(
      { id: req.body.id },
      req.body,
      { upsert: true, new: true }
    );
    res.json({ ok: true, admin });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/admin/users/:id/toggle', async (req, res) => {
  try {
    const admin = await AdminUser.findOne({ id: req.params.id });
    if (admin) {
      admin.active = !admin.active;
      await admin.save();
    }
    res.json({ ok: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/admin/exports', async (req, res) => {
  try {
    const payload = req.body;
    const exp = new ExportAudit({
      id: `EXP-${Date.now()}`,
      actor: 'Finance Admin', // get from auth later
      ...payload,
      exportedAt: dayjs().toISOString(),
    });
    await exp.save();
    res.json({ ok: true, payload });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
