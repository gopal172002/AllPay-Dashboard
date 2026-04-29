# AllPay Dashboard

Web dashboard and Node.js API for AllPay, with local infrastructure via **Docker** (MongoDB + LocalStack S3) and a full backend **Jest** API suite (S3 mocked).

## Requirements

- **Node.js** (current LTS recommended)
- **Docker Desktop** (or compatible engine) for MongoDB and LocalStack

## Infrastructure (Docker)

From the repository root, start the **full stack** (database, S3 simulator, API, and static UI):

```bash
docker compose up -d
```

This starts:

- **MongoDB** on port `27017` (data persisted in a named volume)
- **LocalStack** on port `4566` (S3 only)
- **localstack-setup** — a one-off container that runs `aws s3 mb` against LocalStack to create the **`receipts`** bucket
- **backend** — API (internal to the compose network; not published on host by default)
- **frontend** — **http://localhost:5173** (nginx serves the Vite build and **proxies `/api`** to the backend)

The UI built in Docker uses `VITE_API_BASE_URL=/api`, so the browser talks to the same origin and nginx forwards requests to the API.

When running the backend **on the host** (e.g. `npm start` in `backend/`), it uses:

- `MONGO_URI` — defaults to `mongodb://127.0.0.1:27017/allpay_db` if unset
- `S3_ENDPOINT` — defaults to `http://127.0.0.1:4566` for the AWS S3 client (LocalStack)
- `S3_PUBLIC_BASE` — optional; defaults to the same as `S3_ENDPOINT` for the URL stored on transactions

### MongoDB Compass and `MONGO_URI`

You do **not** need to create the `allpay_db` database (or any collections) by hand in [MongoDB Compass](https://www.mongodb.com/products/compass). Use the **same connection URI** in Compass and in your backend config:

1. In Compass, choose **New connection** and paste your URI—for example **`mongodb://127.0.0.1:27017/allpay_db`** when MongoDB is listening on your machine (including the instance started by `docker compose`).
2. Put that exact URI in **`backend/.env`** as **`MONGO_URI`** (or rely on the default above).
3. Start the backend (`npm start` or `npm run dev` in `backend/`). On connect, Mongoose uses that database name from the URI, and **`seedDatabase`** runs on startup to create sample users, transactions, and related documents.

After the first successful start, you will see **`allpay_db`** (and its collections) in Compass. For Atlas or other hosts, use the URI Compass gives you (including user, password, and options) as **`MONGO_URI`**—still no need to pre-create the database in Compass.

Inside **Docker Compose**, the backend service gets `MONGO_URI=mongodb://mongodb:27017/allpay_db`, `S3_ENDPOINT=http://localstack:4566`, and `S3_PUBLIC_BASE=http://localhost:4566` so receipt links work in the browser.

To expose the API directly on the host (e.g. for Postman), uncomment the `ports` block under the `backend` service in `docker-compose.yml`, then run `docker compose up -d` again.

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
| `MONGO_URI`         | Same URI you use in MongoDB Compass; default `mongodb://127.0.0.1:27017/allpay_db` (DB + seed created on backend startup—no manual create in Compass) |
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
