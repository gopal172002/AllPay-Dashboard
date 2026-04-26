# AllPay Dashboard

Web dashboard and Node.js API for AllPay, with local infrastructure via **Docker** (MongoDB + LocalStack S3) and a full backend **Jest** API suite (S3 mocked).

## Requirements

- **Node.js** (current LTS recommended)
- **Docker Desktop** (or compatible engine) for MongoDB and LocalStack

## Infrastructure (Docker)

From the repository root, start the database and S3 simulator:

```bash
docker compose up -d
```

This starts:

- **MongoDB** on port `27017` (data persisted in a named volume)
- **LocalStack** on port `4566` (S3 only)
- **localstack-setup** — a one-off container that runs `aws s3 mb` against LocalStack to create the **`receipts`** bucket

The backend uses:

- `MONGO_URI` — defaults to `mongodb://127.0.0.1:27017/allpay_db` if unset
- `S3_ENDPOINT` — defaults to `http://127.0.0.1:4566` for the AWS S3 client (LocalStack)
- `S3_PUBLIC_BASE` — optional; defaults to the same as `S3_ENDPOINT` for the URL stored on transactions

**Note:** The backend S3 path-style URL format is: `{S3_PUBLIC_BASE}/receipts/{key}`.

## Backend

```bash
cd backend
npm install
# With Docker (Mongo + LocalStack) already running:
npm run dev
# or
npm start
```

**Tests** — `api` integration tests use an in-process **MongoDB Memory Server** (no Docker required for tests) and **mock S3** uploads. To run tests against a live MongoDB on `MONGO_URI` instead, set `USE_LIVE_MONGO=1` (S3 is still mocked).

```bash
cd backend
npm test
# Optional: use real Mongo
# USE_LIVE_MONGO=1 MONGO_URI=mongodb://127.0.0.1:27017/allpay_test npm test
```

**Environment (optional, `.env` in `backend/`)**

| Variable            | Default / notes                                      |
| ------------------- | ---------------------------------------------------- |
| `PORT`              | `5000`                                               |
| `MONGO_URI`         | `mongodb://127.0.0.1:27017/allpay_db`                |
| `JWT_SECRET`        | Development default in code; set in production        |
| `S3_ENDPOINT`       | `http://127.0.0.1:4566`                              |
| `S3_PUBLIC_BASE`    | Same as `S3_ENDPOINT` if unset                     |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `test` (LocalStack) |

A seed user is created for manual checks: `test@example.com` / `password123`.

## Frontend

```bash
npm install
npm run dev
```

The Vite app reads `VITE_API_BASE_URL` (defaults to `http://localhost:5000/api`).

**Receipt upload:** On an admin transaction detail page, use **Upload / replace receipt**; the file is sent to `POST /api/admin/transactions/:id/receipt` and the returned URL is shown after a successful upload (stored in MongoDB and, with Docker + LocalStack, in the `receipts` bucket).

## Stopping Docker services

```bash
docker compose down
```

## Technology overview

- **Frontend:** React, TypeScript, Vite, MUI
- **Backend:** Express 5, Mongoose, JWT auth, AWS SDK S3 (LocalStack in development), Multer for multipart uploads
- **Tests:** Jest, ts-jest, supertest, mongodb-memory-server, mocked S3 service
