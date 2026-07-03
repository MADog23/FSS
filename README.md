# Financial Safety Forecasting System

A deterministic, event-driven financial safety simulator for households. Not a budgeting app — it answers one question: **"Am I financially safe, now and in the future?"**

## Architecture

```
financial-safety/
├── backend/          Node.js + Express REST API
│   ├── src/
│   │   ├── app.js              Express app entry point
│   │   ├── db/
│   │   │   ├── index.js        PostgreSQL connection pool
│   │   │   └── schema.sql      Database schema + migrations
│   │   ├── engine/
│   │   │   └── forecast.js     Core deterministic forecast engine
│   │   ├── middleware/
│   │   │   └── auth.js         JWT auth + role guards
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── accounts.js
│   │       ├── financial.js    income/bills/cards CRUD
│   │       └── forecast.js     forecast + scenarios
│   └── tests/
│       ├── forecast.test.js    Engine unit tests
│       └── api.test.js         API integration tests
│
├── frontend/          React + Vite mobile-first web app
│   └── src/
│       ├── App.jsx
│       ├── api.js              Centralized API client
│       ├── components/
│       │   ├── Layout.jsx      Mobile bottom-nav shell
│       │   └── CrudPage.jsx    Generic CRUD list/form
│       ├── hooks/
│       │   ├── useAuth.jsx
│       │   └── useForecast.js
│       └── pages/
│           ├── LoginPage.jsx / RegisterPage.jsx
│           ├── DashboardPage.jsx   ← primary safety screen
│           ├── financialPages.jsx  ← Accounts/Income/Bills/Cards
│           └── ScenarioPage.jsx
│
└── API.md             Full endpoint documentation
```

## Local development

### 1. Database

```bash
createdb financial_safety
psql financial_safety -f backend/src/db/schema.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # edit DATABASE_URL and JWT_SECRET
npm install
npm run dev             # http://localhost:3001
```

Run tests:
```bash
npm test                          # forecast engine unit tests (no DB needed)
DATABASE_URL=... npm test         # include API integration tests against a disposable test DB
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:3001`.

### 4. Create your first household

Visit `http://localhost:5173/register`, create a household — you become the admin. Add an account, some income, and a bill or two, then check the Dashboard.

## Core design principles (from spec)

- **Deterministic only.** No AI predictions of income or expenses. Every event you enter is replayed exactly; the engine performs no inference.
- **No spending categories.** Anything entered is assumed required — there's no essential-vs-discretionary logic anywhere in the system.
- **Any account below $0 = Danger.** No exceptions, no overrides.
- **Free Cash** = minimum projected household balance over the horizon, clamped at 0. If negative, a deficit breakdown (first failure date, affected account, shortfall, minimum deposit needed) is shown instead — never advice.
- **Explainability.** Every dashboard number drills down into the exact chronological event list that produced it.
- **Scenarios are overlays, not mutations.** What-if events never touch real data unless explicitly saved.

## Production notes

- Set a strong, random `JWT_SECRET` in production.
- Run schema.sql against your production Postgres instance as a migration; for ongoing schema changes, introduce a migration tool (e.g. `node-pg-migrate`) rather than hand-editing schema.sql.
- The frontend's account-ID fields in Income/Bills/Cards forms currently take raw account IDs for MVP simplicity — swap in a `<select>` populated from `GET /accounts` for a friendlier picker (the Scenario page already does this).
- Enable HTTPS and set `CORS_ORIGIN` to your real frontend origin.
