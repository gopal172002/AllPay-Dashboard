# AllPay Backend API Documentation

**Version:** 1.0  
**Base URL:** `http://localhost:5000/api`  
**Authentication:** JWT Bearer Token (7-day expiry)  

---

## Table of Contents

1. [Authentication](#authentication)
2. [Admin Dashboard](#admin-dashboard)
3. [Analytics](#analytics)
4. [Transactions](#transactions)
5. [Policies](#policies)
6. [Employees](#employees)
7. [Alerts & Billing](#alerts--billing)
8. [User Management](#user-management)
9. [Exports](#exports)
10. [Data Models](#data-models)

---

## Authentication

### POST `/api/auth/signup`

Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "John Doe",
  "companyName": "Acme Inc",
  "companySize": "10-50",
  "monthlySpend": "1L",
  "companyType": "LLC",
  "jobTitle": "Manager"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "fullName": "John Doe",
    "companyName": "Acme Inc",
    "companySize": "10-50",
    "monthlySpend": "1L",
    "companyType": "LLC",
    "jobTitle": "Manager",
    "createdAt": "2025-04-26T10:00:00.000Z",
    "adminId": "ADM-1",
    "adminRole": "super_admin"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Response (400):**
```json
{
  "ok": false,
  "message": "Account already exists."
}
```

---

### POST `/api/auth/login`

Authenticate with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "fullName": "John Doe",
    "companyName": "Acme Inc",
    "companySize": "10-50",
    "monthlySpend": "1L",
    "companyType": "LLC",
    "jobTitle": "Manager",
    "createdAt": "2025-04-26T10:00:00.000Z",
    "adminId": "ADM-1",
    "adminRole": "super_admin"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Response (400):**
```json
{
  "ok": false,
  "message": "No account found."
}
```

---

## Admin Dashboard

*All admin endpoints require JWT authentication and active AdminUser record.*

### GET `/api/admin/bootstrap`

Load all initial data for the admin dashboard.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional): Transaction page number
- `limit` (optional): Transactions per page (max 500, default 100)
- `since` (optional): ISO date string for transactions since
- `startDate` (optional): ISO date string for range start
- `endDate` (optional): ISO date string for range end
- `status` (optional): Filter by status (pending, approved, rejected, flagged)
- `flagged` (optional): "1" or "true" to show only flagged
- `employeeId` (optional): Filter by employee ID
- `department` (optional): Filter by department
- `category` (optional): Filter by category
- `upiApp` (optional): Filter by UPI app
- `minAmount` (optional): Minimum amount
- `maxAmount` (optional): Maximum amount
- `search` (optional): Free-text search (employeeName, merchantName, upiRefId)

**Response (200 OK):**
```json
{
  "transactions": [
    {
      "id": "TX-70001",
      "employeeId": "EMP-1000",
      "employeeName": "Employee 1",
      "department": "Engineering",
      "merchantName": "Uber",
      "mcc": "4121",
      "category": "Travel",
      "amount": 450,
      "claimedAmount": 450,
      "dateTime": "2025-04-26T10:00:00.000Z",
      "status": "pending",
      "upiApp": "GPay",
      "upiRefId": "UPI12345",
      "isNew": true,
      "flags": [],
      "hasMatchingAllpayRecord": true,
      "purposeCategory": "Travel",
      "timeline": []
    }
  ],
  "transactionPage": 1,
  "transactionPageSize": 350,
  "transactionTotal": 2,
  "hasMoreTransactions": false,
  "employees": [
    {
      "id": "EMP-1000",
      "name": "Employee 1",
      "email": "emp1@allpay.in",
      "department": "Engineering",
      "role": "manager",
      "active": true,
      "onboarded": false,
      "travelApproved": false
    }
  ],
  "policies": [
    {
      "id": "POL-1",
      "name": "Fuel max Rs.3000/month",
      "mccCategory": "Fuel",
      "maxPerTransaction": 1500,
      "maxPerMonth": 3000,
      "allowedDays": [1, 2, 3, 4, 5],
      "scopeType": "all",
      "startDate": "2025-04-26T10:00:00.000Z",
      "active": true
    }
  ],
  "alertsConfig": {
    "delivery": "both",
    "threshold": "daily_digest",
    "mutedPolicies": [],
    "mutedEmployees": []
  },
  "admins": [
    {
      "id": "ADM-1",
      "name": "Riya Nair",
      "email": "riya@allpay.in",
      "role": "super_admin",
      "active": true,
      "twoFactor": true
    }
  ],
  "billing": {
    "plan": "Pro",
    "billingCycle": "monthly",
    "nextRenewal": "2025-05-26",
    "licenses": 25,
    "headcount": 24
  },
  "exportAudits": [
    {
      "id": "EXP-123",
      "actor": "Riya Nair",
      "format": "CSV",
      "dateRange": "2025-04-01 to 2025-04-30",
      "exportedAt": "2025-04-26T10:00:00.000Z",
      "recordCount": 150
    }
  ]
}
```

---

## Analytics

### GET `/api/admin/analytics/daily-spend`

Get daily spend totals and category breakdown for a specific date.

**Roles:** super_admin, finance_manager, hr_manager, auditor

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `date` (optional): Date in YYYY-MM-DD format (defaults to today)

**Response (200 OK):**
```json
{
  "date": "2025-04-26",
  "totalSpend": 12500.50,
  "transactionCount": 45,
  "byCategory": [
    {
      "category": "Travel",
      "total": 5000.00,
      "count": 10
    },
    {
      "category": "Meals",
      "total": 3500.50,
      "count": 20
    },
    {
      "category": "Fuel",
      "total": 4000.00,
      "count": 15
    }
  ]
}
```

---

### GET `/api/admin/analytics/aggregated`

Get comprehensive analytics including KPIs, category/employee breakdowns, and timeline data.

**Roles:** super_admin, finance_manager, hr_manager, auditor

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `startDate` (optional): ISO date string (defaults to 30 days ago)
- `endDate` (optional): ISO date string (defaults to today)
- `timelineBucket` (optional): "daily", "weekly", or "monthly" (default: "daily")

**Response (200 OK):**
```json
{
  "dateRange": {
    "start": "2025-03-27T00:00:00.000Z",
    "end": "2025-04-26T23:59:59.999Z"
  },
  "kpis": {
    "totalSpend": 150000.00,
    "transactionCount": 500,
    "averageTransaction": 300.00,
    "approvedSpend": 120000.00,
    "pendingSpend": 25000.00,
    "rejectedAmount": 5000.00,
    "rejectedCount": 15,
    "flaggedCount": 10
  },
  "byCategory": [
    {
      "category": "Travel",
      "total": 60000.00,
      "count": 150
    },
    {
      "category": "Meals",
      "total": 40000.00,
      "count": 200
    }
  ],
  "byEmployee": [
    {
      "employeeId": "EMP-1000",
      "employeeName": "Employee 1",
      "total": 15000.00,
      "count": 50
    }
  ],
  "timeline": [
    {
      "period": "2025-03-27",
      "total": 5000.00,
      "count": 15
    },
    {
      "period": "2025-03-28",
      "total": 6000.00,
      "count": 18
    }
  ],
  "topSpenders": [
    {
      "employeeId": "EMP-1000",
      "employeeName": "Employee 1",
      "total": 15000.00
    }
  ]
}
```

---

## Transactions

### GET `/api/admin/transactions`

List transactions with pagination and filtering.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:** (same as bootstrap endpoint)

**Response (200 OK):**
```json
{
  "transactions": [...],
  "transactionPage": 1,
  "transactionPageSize": 100,
  "transactionTotal": 500,
  "hasMoreTransactions": true
}
```

---

### POST `/api/admin/transactions/approve`

Approve a transaction (full or partial approval).

**Roles:** super_admin, finance_manager

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "transactionId": "TX-70001",
  "amount": 450
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "transactionId": "TX-70001",
  "amount": 450,
  "processedAt": "2025-04-26T10:00:00.000Z"
}
```

---

### POST `/api/admin/transactions/reject`

Reject a transaction with a reason.

**Roles:** super_admin, finance_manager

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "transactionId": "TX-70001",
  "reason": "Policy violation"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "transactionId": "TX-70001",
  "reason": "Policy violation",
  "processedAt": "2025-04-26T10:00:00.000Z"
}
```

---

### POST `/api/admin/transactions/bulk`

Bulk approve or reject multiple transactions.

**Roles:** super_admin, finance_manager

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "ids": ["TX-70001", "TX-70002", "TX-70003"],
  "decision": "approved",
  "reason": "Bulk approval"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "ids": ["TX-70001", "TX-70002", "TX-70003"],
  "decision": "approved",
  "reason": "Bulk approval",
  "processedAt": "2025-04-26T10:00:00.000Z"
}
```

---

### POST `/api/admin/transactions/:id/receipt`

Upload a receipt file for a transaction.

**Roles:** super_admin, finance_manager

**Headers:**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Request Body:**
- `receipt`: File (max 10MB, supported: PNG, JPEG, WebP, GIF)

**Response (200 OK):**
```json
{
  "ok": true,
  "transactionId": "TX-70001",
  "receiptUrl": "http://127.0.0.1:4566/receipts/tx/TX-70001/abc123def456.jpg"
}
```

---

## Policies

### POST `/api/admin/policies`

Create a new expense policy.

**Roles:** super_admin, finance_manager

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "id": "POL-2",
  "name": "Meals max Rs.2000/transaction",
  "mccCategory": "Meals",
  "maxPerTransaction": 2000,
  "maxPerMonth": 5000,
  "allowedDays": [1, 2, 3, 4, 5],
  "scopeType": "all",
  "scopeValue": null,
  "startDate": "2025-04-26T10:00:00.000Z",
  "endDate": null,
  "active": true
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "policy": {
    "id": "POL-2",
    "name": "Meals max Rs.2000/transaction",
    "mccCategory": "Meals",
    "maxPerTransaction": 2000,
    "maxPerMonth": 5000,
    "allowedDays": [1, 2, 3, 4, 5],
    "scopeType": "all",
    "startDate": "2025-04-26T10:00:00.000Z",
    "active": true
  }
}
```

---

### POST `/api/admin/policies/preview`

Simulate a policy against existing transactions to preview impact.

**Roles:** super_admin, finance_manager

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "id": "POL-NEW",
  "name": "Fuel max Rs.3000/month",
  "mccCategory": "Fuel",
  "maxPerTransaction": 1500,
  "maxPerMonth": 3000,
  "allowedDays": [1, 2, 3, 4, 5],
  "scopeType": "all",
  "startDate": "2025-04-01T00:00:00.000Z",
  "endDate": "2025-12-31T23:59:59.999Z",
  "active": true
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "wouldFlagCount": 25,
  "affectedEmployeeCount": 8,
  "affectedEmployeeIds": ["EMP-1000", "EMP-1001", "EMP-1002"],
  "estimatedSavingsIfRejected": 15000.50,
  "matches": [
    {
      "transactionId": "TX-70001",
      "reasons": ["Amount exceeds per-transaction cap"],
      "amount": 2000,
      "employeeId": "EMP-1000",
      "employeeName": "Employee 1",
      "category": "Fuel"
    },
    {
      "transactionId": "TX-70002",
      "reasons": ["Not on an allowed weekday"],
      "amount": 1000,
      "employeeId": "EMP-1001",
      "employeeName": "Employee 2",
      "category": "Fuel"
    }
  ],
  "hasMore": false
}
```

---

## Employees

### POST `/api/admin/employees/import`

Bulk import employees from CSV.

**Roles:** super_admin, finance_manager, hr_manager

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "csvText": "id,name,email,department,role\nEMP-1001,John Doe,john@example.com,Engineering,manager\nEMP-1002,Jane Smith,jane@example.com,Sales,employee"
}
```

**CSV Format:**
- Required columns: `email`
- Optional columns: `id`, `name`, `department`, `role`
- Role values: `manager` or `employee` (default: employee)

**Response (200 OK):**
```json
{
  "ok": true,
  "created": [
    {
      "id": "EMP-1001",
      "name": "John Doe",
      "email": "john@example.com",
      "department": "Engineering",
      "role": "manager",
      "active": true,
      "onboarded": false,
      "travelApproved": false
    }
  ],
  "skipped": 0,
  "errors": [],
  "createdCount": 1
}
```

---

### POST `/api/admin/employees/invite`

Invite a new employee with an invite token.

**Roles:** super_admin, finance_manager, hr_manager

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "email": "newemployee@example.com",
  "department": "Engineering",
  "name": "New Employee"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "employee": {
    "id": "EMP-INV-abc123",
    "name": "New Employee",
    "email": "newemployee@example.com",
    "department": "Engineering",
    "role": "employee",
    "active": true,
    "onboarded": false,
    "travelApproved": false,
    "inviteToken": "a1b2c3d4e5f6..."
  }
}
```

---

## Alerts & Billing

### PATCH `/api/admin/alerts`

Update alert configuration.

**Roles:** super_admin, finance_manager

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "delivery": "both",
  "threshold": "daily_digest",
  "mutedPolicies": ["POL-1"],
  "mutedEmployees": ["EMP-1000"]
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "config": {
    "delivery": "both",
    "threshold": "daily_digest",
    "mutedPolicies": ["POL-1"],
    "mutedEmployees": ["EMP-1000"]
  }
}
```

---

### PATCH `/api/admin/billing`

Update billing plan.

**Roles:** super_admin

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "plan": "Enterprise",
  "billingCycle": "monthly",
  "nextRenewal": "2025-05-26",
  "licenses": 50,
  "headcount": 48
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "plan": "Enterprise"
}
```

---

## User Management

### PUT `/api/admin/users`

Create or update an admin user.

**Roles:** super_admin

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "id": "ADM-3",
  "name": "New Admin",
  "email": "newadmin@allpay.in",
  "role": "finance_manager",
  "active": true,
  "twoFactor": true
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "admin": {
    "id": "ADM-3",
    "name": "New Admin",
    "email": "newadmin@allpay.in",
    "role": "finance_manager",
    "active": true,
    "twoFactor": true
  }
}
```

---

### POST `/api/admin/users/:id/toggle`

Toggle admin user active status.

**Roles:** super_admin

**Headers:**
```
Authorization: Bearer <token>
```

**URL Parameters:**
- `id`: Admin user ID

**Response (200 OK):**
```json
{
  "ok": true,
  "id": "ADM-3"
}
```

---

## Exports

### POST `/api/admin/exports`

Log export activity for audit trail.

**Roles:** super_admin, finance_manager, auditor

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "format": "CSV",
  "dateRange": "2025-04-01 to 2025-04-30",
  "recordCount": 150
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "payload": {
    "format": "CSV",
    "dateRange": "2025-04-01 to 2025-04-30",
    "recordCount": 150
  }
}
```

---

## Data Models

### AuthUser

```typescript
{
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
```

### AdminUser

```typescript
{
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "finance_manager" | "hr_manager" | "auditor";
  active: boolean;
  twoFactor: boolean;
}
```

### Employee

```typescript
{
  id: string;
  name: string;
  email: string;
  department: string;
  role: "employee" | "manager";
  active: boolean;
  onboarded: boolean;
  travelApproved: boolean;
  inviteToken?: string;
}
```

### Transaction

```typescript
{
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
  status: "pending" | "approved" | "rejected" | "flagged";
  upiApp: string;
  upiRefId: string;
  isNew: boolean;
  flags: Array<{
    id: string;
    rule: string;
    reason: string;
    details: string;
  }>;
  adminDecision?: string;
  adminDecisionAt?: string;
  receiptUrl?: string;
  hasMatchingAllpayRecord: boolean;
  purposeCategory: string;
  timeline: Array<{
    id: string;
    actor: string;
    action: string;
    timestamp: string;
  }>;
}
```

### ExpensePolicy

```typescript
{
  id: string;
  name: string;
  mccCategory: string;
  maxPerTransaction: number;
  maxPerMonth: number;
  allowedDays: number[]; // 0-6 (Sunday-Saturday)
  scopeType: "all" | "department" | "employee";
  scopeValue?: string;
  startDate: string;
  endDate?: string;
  active: boolean;
}
```

### AlertConfig

```typescript
{
  delivery: "email" | "slack" | "both";
  threshold: "daily_digest" | "weekly_digest" | "immediate";
  mutedPolicies: string[];
  mutedEmployees: string[];
}
```

### BillingPlan

```typescript
{
  plan: string;
  billingCycle: string;
  nextRenewal: string;
  licenses: number;
  headcount: number;
}
```

### ExportAudit

```typescript
{
  id: string;
  actor: string;
  format: string;
  dateRange: string;
  exportedAt: string;
  recordCount: number;
}
```

---

## Role-Based Access Control (RBAC)

| Role | Permissions |
|------|-------------|
| `super_admin` | Full access to all endpoints |
| `finance_manager` | Transactions, policies, alerts, analytics |
| `hr_manager` | Employee management, analytics |
| `auditor` | Analytics, exports, read-only access |

---

## Error Responses

### 401 Unauthorized
```json
{
  "message": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "error": "Admin access required",
  "code": "NOT_ADMIN"
}
```

or

```json
{
  "error": "Forbidden for this role",
  "code": "RBAC_FORBIDDEN",
  "role": "auditor",
  "allowed": ["super_admin", "finance_manager"]
}
```

### 404 Not Found
```json
{
  "error": "Not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Error message details"
}
```

---

## Environment Variables

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/allpay_db
JWT_SECRET=your_secret_key_here
S3_ENDPOINT=http://127.0.0.1:4566
S3_PUBLIC_BASE=http://127.0.0.1:4566
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
NODE_ENV=development
```
