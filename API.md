# API Documentation

Base URL (local dev): `http://localhost:3001`

All endpoints except `/auth/register` and `/auth/login` require an `Authorization: Bearer <token>` header.

Admin-only endpoints (write operations) require the authenticated user's role to be `admin`. Non-admin (`viewer`) users have read-only access.

---

## Auth

### `POST /auth/register`
Creates a new household and its first user (admin).

**Body:**
```json
{ "householdName": "The Smiths", "email": "you@example.com", "password": "at least 8 chars" }
```
**Response (201):** `{ token, user, household }`

### `POST /auth/login`
**Body:** `{ "email": "...", "password": "..." }`
**Response (200):** `{ token, user, household }`

### `GET /auth/me`
Returns the current authenticated user and household.

### `POST /auth/invite` *(admin only)*
Invites a viewer (read-only) user to the household.
**Body:** `{ "email": "...", "password": "..." }`

---

## Accounts

### `GET /accounts`
List all accounts for the household.

### `POST /accounts` *(admin only)*
**Body:** `{ "name": "Checking", "type": "checking", "balance": 2500, "warning_threshold": 300 }`

### `PUT /accounts/:id` *(admin only)*
Partial update; any field omitted is left unchanged.

### `DELETE /accounts/:id` *(admin only)*

---

## Income Events

### `GET /income`

### `POST /income` *(admin only)*
**Body:**
```json
{
  "name": "Salary",
  "amount": 2800,
  "frequency": "biweekly",
  "next_date": "2026-07-11",
  "source_account_id": "<account-uuid>"
}
```
`frequency` is one of: `weekly`, `biweekly`, `monthly`, `once`.

### `PUT /income/:id` *(admin only)*
### `DELETE /income/:id` *(admin only)*

---

## Bill Events

### `GET /bills`

### `POST /bills` *(admin only)*
**Body:**
```json
{
  "name": "Rent",
  "amount": 1400,
  "frequency": "monthly",
  "next_date": "2026-07-01",
  "target_account_id": "<account-uuid>"
}
```

### `PUT /bills/:id` *(admin only)*
### `DELETE /bills/:id` *(admin only)*

---

## Credit Cards

### `GET /cards`

### `POST /cards` *(admin only)*
**Body:**
```json
{
  "name": "Visa",
  "balance": 820,
  "credit_limit": 5000,
  "cycle_day_of_month": 15,
  "due_offset_days": 25,
  "payment_rule": "minimum",
  "fixed_amount": null,
  "payment_account_id": "<account-uuid>"
}
```
`payment_rule` is one of: `minimum`, `statement`, `fixed`. If `fixed`, `fixed_amount` is required.

### `PUT /cards/:id` *(admin only)*
### `DELETE /cards/:id` *(admin only)*

---

## Forecast

### `GET /forecast?horizon=30`
Runs the deterministic forecast engine for the household over the given horizon in days (30, 60, 90, or any value 1–365).

**Response:**
```json
{
  "status": "safe | warning | danger",
  "freeCash": 1850.00,
  "deficit": 0,
  "dangerDate": null,
  "warningDate": null,
  "deficitAccountId": null,
  "firstFailureAmount": null,
  "minimumDepositNeeded": 0,
  "minHousehold": 1850.00,
  "minHouseholdDate": "2026-07-15T00:00:00.000Z",
  "events": [ /* full chronological event list with balancesAfter */ ],
  "finalBalances": { "<accountId>": 4200.00 },
  "horizonDays": 30,
  "generatedAt": "2026-06-30T..."
}
```

### `POST /forecast/simulate`
Runs the forecast with temporary scenario overlays. Not persisted.

**Body:**
```json
{
  "horizonDays": 30,
  "overlays": [
    { "name": "Car repair", "amount": 1200, "event_type": "expense", "event_date": "2026-07-10", "account_id": "<account-uuid>" }
  ]
}
```

---

## Scenarios (saved what-if overlays)

### `GET /scenarios`
Lists saved scenarios with their events.

### `POST /scenarios` *(admin only)*
**Body:**
```json
{
  "name": "Job loss simulation",
  "events": [
    { "name": "Lost income", "amount": 2800, "event_type": "expense", "event_date": "2026-08-01", "account_id": "<account-uuid>" }
  ]
}
```

### `DELETE /scenarios/:id` *(admin only)*

### `GET /scenarios/:id/forecast?horizon=30`
Runs the forecast engine using a saved scenario's overlay events.

---

## Error format

All errors return JSON: `{ "error": "description" }` with an appropriate HTTP status code (400, 401, 403, 404, 409, 500).

## Safety rules enforced by the engine

- Any account balance < $0 at any point in the horizon → `status: "danger"`, no exceptions.
- An account falling below its `warning_threshold` (but staying ≥ 0) → `status: "warning"`.
- `freeCash` is the minimum projected household balance over the horizon, clamped to 0.
- `deficit` is the absolute value of the minimum household balance when negative; this equals `minimumDepositNeeded`.
- The engine performs no inference about expense necessity — every entered bill is treated as required.
