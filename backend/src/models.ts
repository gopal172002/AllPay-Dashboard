import mongoose, { Document, Schema } from 'mongoose';

// Auth User
export interface IAuthUser extends Document {
  id: string;
  email: string;
  fullName: string;
  companyName: string;
  companySize: string;
  monthlySpend: string;
  companyType: string;
  passwordHash: string;
  jobTitle?: string;
  createdAt: string;
}

const AuthUserSchema = new Schema<IAuthUser>({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  companyName: { type: String, required: true },
  companySize: { type: String, required: true },
  monthlySpend: { type: String, required: true },
  companyType: { type: String, required: true },
  passwordHash: { type: String, required: true },
  jobTitle: { type: String },
  createdAt: { type: String, required: true },
});

export const AuthUser = mongoose.model<IAuthUser>('AuthUser', AuthUserSchema);

// Admin User
export interface IAdminUser extends Document {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  twoFactor: boolean;
}

const AdminUserSchema = new Schema<IAdminUser>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  role: { type: String, required: true },
  active: { type: Boolean, required: true },
  twoFactor: { type: Boolean, required: true },
});

export const AdminUser = mongoose.model<IAdminUser>('AdminUser', AdminUserSchema);

// Employee
export interface IEmployee extends Document {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  active: boolean;
  onboarded: boolean;
  travelApproved: boolean;
}

const EmployeeSchema = new Schema<IEmployee>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  department: { type: String, required: true },
  role: { type: String, required: true },
  active: { type: Boolean, default: true },
  onboarded: { type: Boolean, default: false },
  travelApproved: { type: Boolean, default: false },
});

export const Employee = mongoose.model<IEmployee>('Employee', EmployeeSchema);

// Transaction
export interface ITransaction extends Document {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  merchantName: string;
  mcc: string;
  category: string;
  amount: number;
  claimedAmount: number;
  dateTime: string;
  status: string;
  upiApp: string;
  upiRefId: string;
  isNewTx: boolean; // renamed from isNew to avoid mongoose conflict
  flags: Array<{ id: string; rule: string; reason: string; details: string }>;
  adminDecision?: string;
  adminDecisionAt?: string;
  receiptUrl?: string;
  hasMatchingAllpayRecord: boolean;
  purposeCategory: string;
  timeline: Array<{ id: string; actor: string; action: string; timestamp: string }>;
}

const TransactionSchema = new Schema<ITransaction>({
  id: { type: String, required: true, unique: true },
  employeeId: { type: String, required: true },
  employeeName: { type: String, required: true },
  department: { type: String, required: true },
  merchantName: { type: String, required: true },
  mcc: { type: String, required: true },
  category: { type: String, required: true },
  amount: { type: Number, required: true },
  claimedAmount: { type: Number, required: true },
  dateTime: { type: String, required: true },
  status: { type: String, required: true },
  upiApp: { type: String, required: true },
  upiRefId: { type: String, required: true },
  isNewTx: { type: Boolean, default: true },
  flags: { type: [Schema.Types.Mixed], default: [] },
  adminDecision: { type: String },
  adminDecisionAt: { type: String },
  receiptUrl: { type: String },
  hasMatchingAllpayRecord: { type: Boolean, default: false },
  purposeCategory: { type: String, required: true },
  timeline: { type: [Schema.Types.Mixed], default: [] },
});

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);

// Expense Policy
export interface IExpensePolicy extends Document {
  id: string;
  name: string;
  mccCategory: string;
  maxPerTransaction: number;
  maxPerMonth: number;
  allowedDays: number[];
  scopeType: string;
  scopeValue?: string;
  startDate: string;
  endDate?: string;
  active: boolean;
}

const ExpensePolicySchema = new Schema<IExpensePolicy>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  mccCategory: { type: String, required: true },
  maxPerTransaction: { type: Number, required: true },
  maxPerMonth: { type: Number, required: true },
  allowedDays: { type: [Number], required: true },
  scopeType: { type: String, required: true },
  scopeValue: { type: String },
  startDate: { type: String, required: true },
  endDate: { type: String },
  active: { type: Boolean, default: true },
});

export const ExpensePolicy = mongoose.model<IExpensePolicy>('ExpensePolicy', ExpensePolicySchema);

// Alert Config
export interface IAlertConfig extends Document {
  delivery: string;
  threshold: string;
  mutedPolicies: string[];
  mutedEmployees: string[];
}

const AlertConfigSchema = new Schema<IAlertConfig>({
  delivery: { type: String, required: true },
  threshold: { type: String, required: true },
  mutedPolicies: { type: [String], default: [] },
  mutedEmployees: { type: [String], default: [] },
});

export const AlertConfig = mongoose.model<IAlertConfig>('AlertConfig', AlertConfigSchema);

// Billing Plan
export interface IBillingPlan extends Document {
  plan: string;
  billingCycle: string;
  nextRenewal: string;
  licenses: number;
  headcount: number;
}

const BillingPlanSchema = new Schema<IBillingPlan>({
  plan: { type: String, required: true },
  billingCycle: { type: String, required: true },
  nextRenewal: { type: String, required: true },
  licenses: { type: Number, required: true },
  headcount: { type: Number, required: true },
});

export const BillingPlan = mongoose.model<IBillingPlan>('BillingPlan', BillingPlanSchema);

// Export Audit
export interface IExportAudit extends Document {
  id: string;
  actor: string;
  format: string;
  dateRange: string;
  exportedAt: string;
  recordCount: number;
}

const ExportAuditSchema = new Schema<IExportAudit>({
  id: { type: String, required: true, unique: true },
  actor: { type: String, required: true },
  format: { type: String, required: true },
  dateRange: { type: String, required: true },
  exportedAt: { type: String, required: true },
  recordCount: { type: Number, required: true },
});

export const ExportAudit = mongoose.model<IExportAudit>('ExportAudit', ExportAuditSchema);
