import dayjs from "dayjs";

export const DEMO_EMPLOYEE_EMAIL = "employee@demo.allpay.local";
export const DEMO_EMPLOYEE_ID = "EMP-DEMO";

type DemoTx = {
  id: string;
  merchantName: string;
  category: string;
  mcc: string;
  amount: number;
  daysAgo: number;
  hour: number;
  status: "pending" | "approved" | "flagged";
  flags: Array<{ id: string; rule: string; reason: string; details: string }>;
};

/** Curated demo: 18 tx, Fuel total Rs.2,660, approved Rs.4,200, pending Rs.21,735 (last 30 days). */
export const DEMO_EMPLOYEE_TRANSACTIONS: DemoTx[] = [
  {
    id: "TX-DEMO-1000",
    merchantName: "Indian Oil",
    category: "Fuel",
    mcc: "5541",
    amount: 350,
    daysAgo: 0,
    hour: 21,
    status: "flagged",
    flags: [
      { id: "f1", rule: "no_match", reason: "No matching transaction", details: "" },
      { id: "f2", rule: "amount", reason: "Amount Mismatch", details: "" },
      { id: "f3", rule: "category", reason: "Category Mismatch", details: "" },
    ],
  },
  {
    id: "TX-DEMO-1001",
    merchantName: "Swiggy",
    category: "Meals",
    mcc: "5812",
    amount: 1050,
    daysAgo: 6,
    hour: 12,
    status: "flagged",
    flags: [{ id: "f4", rule: "duplicate", reason: "Possible duplicate", details: "" }],
  },
  {
    id: "TX-DEMO-1002",
    merchantName: "The Brew Bar",
    category: "Bars/Alcohol",
    mcc: "5813",
    amount: 1680,
    daysAgo: 12,
    hour: 3,
    status: "flagged",
    flags: [{ id: "f5", rule: "wallet", reason: "No matching corporate wallet line", details: "" }],
  },
  {
    id: "TX-DEMO-1003",
    merchantName: "Swiggy",
    category: "Meals",
    mcc: "5812",
    amount: 2520,
    daysAgo: 21,
    hour: 15,
    status: "flagged",
    flags: [{ id: "f6", rule: "mcc", reason: "MCC vs memo mismatch", details: "" }],
  },
  { id: "TX-DEMO-1004", merchantName: "Indian Oil", category: "Fuel", mcc: "5541", amount: 420, daysAgo: 1, hour: 10, status: "pending", flags: [] },
  { id: "TX-DEMO-1005", merchantName: "HP Petrol", category: "Fuel", mcc: "5541", amount: 680, daysAgo: 2, hour: 8, status: "pending", flags: [] },
  { id: "TX-DEMO-1006", merchantName: "Shell Fuel", category: "Fuel", mcc: "5541", amount: 510, daysAgo: 4, hour: 18, status: "pending", flags: [] },
  { id: "TX-DEMO-1007", merchantName: "Indian Oil", category: "Fuel", mcc: "5541", amount: 700, daysAgo: 8, hour: 7, status: "pending", flags: [] },
  { id: "TX-DEMO-1008", merchantName: "Amazon Business", category: "Office Supplies", mcc: "5943", amount: 4200, daysAgo: 3, hour: 14, status: "pending", flags: [] },
  { id: "TX-DEMO-1009", merchantName: "Staples India", category: "Office Supplies", mcc: "5943", amount: 1850, daysAgo: 7, hour: 11, status: "pending", flags: [] },
  { id: "TX-DEMO-1010", merchantName: "Uber", category: "Travel", mcc: "4121", amount: 890, daysAgo: 5, hour: 9, status: "pending", flags: [] },
  { id: "TX-DEMO-1011", merchantName: "Ola", category: "Travel", mcc: "4121", amount: 1240, daysAgo: 9, hour: 20, status: "pending", flags: [] },
  { id: "TX-DEMO-1012", merchantName: "MakeMyTrip", category: "Travel", mcc: "4722", amount: 2545, daysAgo: 11, hour: 16, status: "pending", flags: [] },
  { id: "TX-DEMO-1013", merchantName: "Taj Hotels", category: "Lodging", mcc: "7011", amount: 5500, daysAgo: 14, hour: 13, status: "pending", flags: [] },
  { id: "TX-DEMO-1014", merchantName: "OYO Rooms", category: "Lodging", mcc: "7011", amount: 2200, daysAgo: 18, hour: 22, status: "pending", flags: [] },
  { id: "TX-DEMO-1015", merchantName: "Zomato", category: "Meals", mcc: "5812", amount: 1400, daysAgo: 10, hour: 19, status: "approved", flags: [] },
  { id: "TX-DEMO-1016", merchantName: "Cafe Coffee Day", category: "Meals", mcc: "5814", amount: 1200, daysAgo: 15, hour: 17, status: "approved", flags: [] },
  { id: "TX-DEMO-1017", merchantName: "Reliance Smart", category: "Office Supplies", mcc: "5411", amount: 1600, daysAgo: 20, hour: 12, status: "approved", flags: [] },
];

export function buildDemoTransactionDoc(
  tx: DemoTx,
  employeeId: string,
  employeeName: string,
  department: string
) {
  const dateTime = dayjs().subtract(tx.daysAgo, "day").hour(tx.hour).minute(38).second(0).toISOString();
  return {
    id: tx.id,
    employeeId,
    employeeName,
    department,
    merchantName: tx.merchantName,
    mcc: tx.mcc,
    category: tx.category,
    amount: tx.amount,
    claimedAmount: tx.amount,
    dateTime,
    status: tx.status,
    upiApp: tx.daysAgo % 2 === 0 ? "GPay" : "PhonePe",
    upiRefId: `UPI${11811000 + parseInt(tx.id.replace(/\D/g, "").slice(-3), 10)}`,
    isNewTx: tx.status === "pending",
    flags: tx.flags,
    hasMatchingAllpayRecord: tx.flags.length === 0,
    purposeCategory: tx.category,
    timeline: [],
    adminDecision: tx.status === "approved" ? "Approved in full" : undefined,
    adminDecisionAt: tx.status === "approved" ? dateTime : undefined,
  };
}
