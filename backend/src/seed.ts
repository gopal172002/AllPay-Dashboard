import {
  AuthUser,
  Employee,
  Transaction,
  ExpensePolicy,
  AlertConfig,
  AdminUser,
  BillingPlan
} from './models';
import bcrypt from 'bcryptjs';

// Minimal hardcoded seed so backend is self-contained. 
// We will generate a few realistic transactions.

export async function seedDatabase() {
  const adminCount = await AdminUser.countDocuments();
  if (adminCount > 0) {
    console.log('Database already seeded');
    return;
  }

  console.log('Seeding database...');

  // Create one auth user for testing
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password123', salt);
  await AuthUser.create({
    id: 'usr_test',
    email: 'test@example.com',
    fullName: 'Test User',
    companyName: 'Test Inc',
    companySize: '10-50',
    monthlySpend: '1L',
    companyType: 'LLC',
    passwordHash,
    createdAt: new Date().toISOString()
  });

  await AuthUser.create({
    id: 'usr_audit',
    email: 'auditor@example.com',
    fullName: 'Auditor User',
    companyName: 'Test Inc',
    companySize: '10-50',
    monthlySpend: '1L',
    companyType: 'LLC',
    passwordHash,
    createdAt: new Date().toISOString()
  });

  const admins = [
    { id: "ADM-1", name: "Riya Nair", email: "riya@allpay.in", role: "super_admin", active: true, twoFactor: true },
    { id: "ADM-2", name: "Aman Sharma", email: "aman@allpay.in", role: "finance_manager", active: true, twoFactor: true },
    { id: "ADM-TEST", name: "Test Admin", email: "test@example.com", role: "super_admin", active: true, twoFactor: false },
    { id: "ADM-AUD", name: "Read-only Auditor", email: "auditor@example.com", role: "auditor", active: true, twoFactor: false }
  ];
  await AdminUser.insertMany(admins);

  const employees = [
    { id: "EMP-1000", name: "Employee 1", email: "emp1@allpay.in", department: "Engineering", role: "manager", active: true },
    { id: "EMP-1001", name: "Employee 2", email: "emp2@allpay.in", department: "Sales", role: "employee", active: true },
    { id: "EMP-1002", name: "Employee 3", email: "emp3@allpay.in", department: "HR", role: "employee", active: true },
  ];
  await Employee.insertMany(employees);

  await AlertConfig.create({
    delivery: "both",
    threshold: "daily_digest",
    mutedPolicies: [],
    mutedEmployees: []
  });

  await BillingPlan.create({
    plan: "Pro",
    billingCycle: "monthly",
    nextRenewal: new Date().toISOString(),
    licenses: 25,
    headcount: 24
  });

  const policies = [
    {
      id: "POL-1",
      name: "Fuel max Rs.3000/month",
      mccCategory: "Fuel",
      maxPerTransaction: 1500,
      maxPerMonth: 3000,
      allowedDays: [1, 2, 3, 4, 5],
      scopeType: "all",
      startDate: new Date().toISOString(),
      active: true,
    }
  ];
  await ExpensePolicy.insertMany(policies);

  const txs = [
    {
      id: `TX-70001`,
      employeeId: "EMP-1000",
      employeeName: "Employee 1",
      department: "Engineering",
      merchantName: "Uber",
      mcc: "4121",
      category: "Travel",
      amount: 450,
      claimedAmount: 450,
      dateTime: new Date().toISOString(),
      status: "pending",
      upiApp: "GPay",
      upiRefId: "UPI12345",
      isNewTx: true,
      flags: [],
      hasMatchingAllpayRecord: true,
      purposeCategory: "Travel",
      timeline: []
    },
    {
      id: `TX-70002`,
      employeeId: "EMP-1001",
      employeeName: "Employee 2",
      department: "Sales",
      merchantName: "Swiggy",
      mcc: "5812",
      category: "Meals",
      amount: 1500,
      claimedAmount: 1500,
      dateTime: new Date().toISOString(),
      status: "flagged",
      upiApp: "PhonePe",
      upiRefId: "UPI99999",
      isNewTx: true,
      flags: [{ id: 'f1', rule: 'High Amount', reason: 'Unusually high amount for meals', details: '' }],
      hasMatchingAllpayRecord: false,
      purposeCategory: "Client Entertainment",
      timeline: []
    }
  ];
  await Transaction.insertMany(txs);

  console.log('Seeding completed');
}
