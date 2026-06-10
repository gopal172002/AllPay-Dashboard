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
import dayjs from 'dayjs';
import {
  DEMO_EMPLOYEE_EMAIL,
  DEMO_EMPLOYEE_ID,
  DEMO_EMPLOYEE_TRANSACTIONS,
  buildDemoTransactionDoc,
} from './demoEmployeeData';

async function ensureDemoEmployeeAccount(passwordHash: string) {
  await Employee.deleteMany({ email: DEMO_EMPLOYEE_EMAIL, id: { $ne: DEMO_EMPLOYEE_ID } });
  await Employee.updateOne(
    { email: DEMO_EMPLOYEE_EMAIL },
    {
      $set: {
        id: DEMO_EMPLOYEE_ID,
        name: 'Demo Employee',
        email: DEMO_EMPLOYEE_EMAIL,
        department: 'Operations',
        role: 'employee',
        active: true,
        onboarded: true,
        travelApproved: true,
      },
    },
    { upsert: true }
  );
  const existingAuth = await AuthUser.findOne({ email: DEMO_EMPLOYEE_EMAIL });
  if (!existingAuth) {
    await AuthUser.create({
      id: 'usr_employee_demo',
      email: DEMO_EMPLOYEE_EMAIL,
      fullName: 'Demo Employee',
      companyName: 'AllPay Demo',
      companySize: '11–50 employees',
      monthlySpend: '₹5 lakh – ₹25 lakh',
      companyType: 'Private Limited Company (Pvt Ltd)',
      passwordHash,
      createdAt: new Date().toISOString(),
    });
  }
}

async function seedDemoEmployeeTransactions(employeeId: string, employeeName: string, department: string) {
  for (const tx of DEMO_EMPLOYEE_TRANSACTIONS) {
    const doc = buildDemoTransactionDoc(tx, employeeId, employeeName, department);
    await Transaction.updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
  }
}

export async function seedDatabase() {
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password123', salt);

  const adminCount = await AdminUser.countDocuments();
  if (adminCount > 0) {
    await Employee.updateOne(
      { id: "EMP-1000" },
      { $set: { inviteToken: "seed-invite-emp1000" } }
    );
    await ensureDemoEmployeeAccount(passwordHash);
    const demo = await Employee.findOne({ email: DEMO_EMPLOYEE_EMAIL });
    if (demo) {
      await seedDemoEmployeeTransactions(demo.id, demo.name, demo.department);
    }
    console.log("Database already seeded");
    return;
  }

  console.log('Seeding database...');

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

  await AuthUser.create({
    id: 'usr_employee_demo',
    email: DEMO_EMPLOYEE_EMAIL,
    fullName: 'Demo Employee',
    companyName: 'AllPay Demo',
    companySize: '11–50 employees',
    monthlySpend: '₹5 lakh – ₹25 lakh',
    companyType: 'Private Limited Company (Pvt Ltd)',
    passwordHash,
    createdAt: new Date().toISOString(),
  });

  const admins = [
    { id: "ADM-1", name: "Riya Nair", email: "riya@allpay.in", role: "super_admin", active: true, twoFactor: true },
    { id: "ADM-2", name: "Aman Sharma", email: "aman@allpay.in", role: "finance_manager", active: true, twoFactor: true },
    { id: "ADM-TEST", name: "Test Admin", email: "test@example.com", role: "super_admin", active: true, twoFactor: false },
    { id: "ADM-AUD", name: "Read-only Auditor", email: "auditor@example.com", role: "auditor", active: true, twoFactor: false }
  ];
  await AdminUser.insertMany(admins);

  const employees = [
    {
      id: "EMP-1000",
      name: "Employee 1",
      email: "emp1@allpay.in",
      department: "Engineering",
      role: "manager",
      active: true,
      inviteToken: "seed-invite-emp1000"
    },
    { id: "EMP-1001", name: "Employee 2", email: "emp2@allpay.in", department: "Sales", role: "employee", active: true },
    { id: "EMP-1002", name: "Employee 3", email: "emp3@allpay.in", department: "HR", role: "employee", active: true },
    {
      id: DEMO_EMPLOYEE_ID,
      name: "Demo Employee",
      email: DEMO_EMPLOYEE_EMAIL,
      department: "Operations",
      role: "employee",
      active: true,
      onboarded: true,
      travelApproved: true,
    },
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
  await seedDemoEmployeeTransactions(DEMO_EMPLOYEE_ID, "Demo Employee", "Operations");

  console.log('Seeding completed');
}
