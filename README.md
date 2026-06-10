# AllPay Dashboard

React admin dashboard and Node.js API for AllPay. Runs locally with **Docker** (MongoDB + LocalStack S3) or with infrastructure in Docker and app processes on the host.

## What you need

| Requirement | Purpose |
|-------------|---------|
| **Node.js** 20+ (LTS recommended) | Frontend (`npm`) and backend (`backend/npm`) |
| **npm** | Install dependencies and run scripts |
| **Docker Desktop** (or compatible engine) | MongoDB, LocalStack S3, and optional full-stack compose |

No manual database setup: the backend **seeds** sample data on first connect.

## Quick start

### 1. Clone and install dependencies

```bash
cd AllPay-Dashboard
npm install

cd backend
npm install
cd ..
```

### 2. Environment files

| File | Copy from |
|------|-----------|
| `AllPay-Dashboard/.env` | [`.env.example`](.env.example) — frontend + Docker Razorpay vars |
| `AllPay-Dashboard/backend/.env` | [`backend/.env.example`](backend/.env.example) — API |

```bash
# From AllPay-Dashboard root (Windows PowerShell)
copy .env.example .env
copy backend\.env.example backend\.env

# macOS / Linux
cp .env.example .env
cp backend/.env.example backend/.env
```

Defaults work for local development without editing `.env`. Only set Razorpay variables if you are testing live UPI flows.

### 3. Choose how to run

#### Option A — Full stack in Docker (simplest)

Starts MongoDB, LocalStack, API, and built UI (nginx on port **5173**).

```bash
docker compose up -d
```

- **UI:** http://localhost:5173  
- **API:** proxied at http://localhost:5173/api (browser uses `VITE_API_BASE_URL=/api` in the image)  
- **MongoDB:** `localhost:27017`  
- **LocalStack S3:** `localhost:4566` (bucket `receipts` created automatically)

Optional: put Razorpay keys in root `.env` (see [`.env.example`](.env.example)); Compose passes them to the backend.

#### Option B — Local dev (hot reload)

**Terminal 1 — infrastructure:**

```bash
docker compose up -d mongodb localstack localstack-setup
```

**Terminal 2 — API:**

```bash
cd backend
npm run dev
```

API: http://localhost:5000 (routes under `/api`).

After pulling employee-dashboard changes, **restart the backend** (`Ctrl+C`, then `npm run dev` again) so new `/api/employee/*` routes and demo seed data load.

**Terminal 3 — frontend:**

```bash
# from AllPay-Dashboard root
npm run dev
```

Vite dev server: http://localhost:5173 (default). Ensure root `.env` has:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

### 4. Sign in

After the backend has started at least once (seed runs on connect):

| Email | Password |
|-------|----------|
| `test@example.com` | `password123` |

## npm scripts

| Location | Command | Description |
|----------|---------|-------------|
| Root | `npm run dev` | Vite dev server |
| Root | `npm run build` | Typecheck + production build |
| Root | `npm run preview` | Serve production build locally |
| Root | `npm run lint` | ESLint |
| `backend/` | `npm run dev` | API with reload (`tsx watch`) |
| `backend/` | `npm start` | API without watch |
| `backend/` | `npm test` | Jest (in-memory Mongo; S3 mocked) |

## Environment variables

### Frontend (root `.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:5000/api` | API base URL for the React app |

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | — | `production` enforces Razorpay secrets when UPI is enabled |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/allpay_db` | MongoDB connection string |
| `JWT_SECRET` | dev fallback in code | JWT signing secret — **set in production** |
| `MOBILE_SYNC_SECRET` | — | Optional; mobile sync auth |
| `S3_ENDPOINT` | `http://127.0.0.1:4566` | S3 API endpoint (LocalStack locally) |
| `S3_PUBLIC_BASE` | same as `S3_ENDPOINT` | Public URL prefix for receipt links in the browser |
| `AWS_REGION` | `us-east-1` | AWS region |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `test` | LocalStack credentials |
| `USE_RAZORPAY_UPI` | `false` | Enable Razorpay UPI (`true` or `1`) |
| `RAZORPAY_KEY_ID` | — | Razorpay API key |
| `RAZORPAY_KEY_SECRET` | — | Razorpay API secret |
| `RAZORPAY_WEBHOOK_SECRET` | — | Webhook signature secret |

Full templates: [`.env.example`](.env.example), [`backend/.env.example`](backend/.env.example).

### Docker Compose

The `backend` service sets `MONGO_URI`, `S3_*`, and reads Razorpay variables from the **root** `.env` file. Receipt URLs use `S3_PUBLIC_BASE=http://localhost:4566` so links work in the browser.

To expose the API directly on the host (e.g. Postman), uncomment the `ports` block under `backend` in [`docker-compose.yml`](docker-compose.yml).

## MongoDB Compass

Use the same URI as `MONGO_URI` (e.g. `mongodb://127.0.0.1:27017/allpay_db`). You do not need to create the database manually; collections appear after the first backend start and seed.

## Tests

```bash
cd backend
npm test
```

Uses in-process MongoDB Memory Server and mocked S3. For a live Mongo instance:

```bash
# PowerShell
$env:USE_LIVE_MONGO="1"; $env:MONGO_URI="mongodb://127.0.0.1:27017/allpay_test"; npm test
```

## Stopping Docker

```bash
docker compose down
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Cannot find type definition file for 'vite/client'` | Run `npm install` in the project root |
| UI cannot reach API | Check `VITE_API_BASE_URL` and that the backend is on port 5000 |
| Receipt upload fails | Ensure LocalStack is up and bucket `receipts` exists (`docker compose up` runs setup) |
| Razorpay errors in production | Set `RAZORPAY_*` and `USE_RAZORPAY_UPI=true` when `NODE_ENV=production` |

## Technology

- **Frontend:** React, TypeScript, Vite, MUI  
- **Backend:** Express 5, Mongoose, JWT, AWS SDK S3 (LocalStack in dev), Razorpay  
- **Tests:** Jest, supertest, mongodb-memory-server


## admin login -
Email - test@example.com 
password - password123

## employee login -
Email - employee@demo.allpay.local
password - password123