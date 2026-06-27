# RapidRubric — TA Review API (Assignment 2 implementation)

A self-contained, deployable Node.js + Express + PostgreSQL implementation of the
**TA Review & Approval** feature for RapidRubric. It implements the two graded
endpoints — **`GET /api/v1/ta/queue`** and **`POST /api/v1/ta/submissions/:id/release`**
— plus the supporting auth and review-detail endpoints needed to run the full
workflow. The release endpoint enforces the **review-integrity guardrail** from
the project proposal (a TA cannot rubber-stamp AI output).

It depends only on a PostgreSQL connection string, so it deploys cleanly to
Render, Railway, or any host with a managed Postgres.

## Endpoints

| Method | Route | Role | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | public | Create an account (supporting) |
| POST | `/api/v1/auth/login` | public | Obtain a JWT (supporting) |
| GET | `/api/v1/ta/queue` | ta | **Implemented #1** — submissions in the TA's queue |
| GET | `/api/v1/ta/submissions/:id` | ta | Side-by-side review payload (supporting) |
| POST | `/api/v1/ta/submissions/:id/release` | ta | **Implemented #2** — release feedback (guardrailed) |

## Run locally

```bash
npm install
cp .env.example .env          # set DATABASE_URL, JWT_SECRET (PGSSL=disable for local)
npm run migrate               # applies db/schema.sql
npm run seed                  # inserts demo data (or: psql ... -f db/seed.sql)
npm start                     # http://localhost:3001
```

Demo accounts (password `Password123!`): `instructor@test.com`, `ta1@test.com`,
`student1@test.com`, `student2@test.com`.

## Deploy to Render (free)

1. Push this folder to a GitHub repo.
2. In Render: **New → Blueprint** and select the repo. `render.yaml` provisions a
   free web service **and** a free PostgreSQL database, wiring `DATABASE_URL` and
   generating `JWT_SECRET` automatically.
3. After the first deploy, open the Render **Shell** for the web service and run
   `npm run migrate && npm run seed` (or connect with `psql "$DATABASE_URL"` and
   run `db/schema.sql` then `db/seed.sql`).
4. Your live base URL is `https://<service-name>.onrender.com/api/v1`.

(Railway is equivalent: create a project, add a PostgreSQL plugin, set
`DATABASE_URL` from the plugin and a `JWT_SECRET` variable, deploy from GitHub.)

## Postman quickstart

1. `POST {{baseUrl}}/auth/login` with body `{"email":"ta1@test.com","password":"Password123!"}`.
   Copy `access_token`.
2. Set a collection variable `token` to that value and add header
   `Authorization: Bearer {{token}}` to the TA requests.
3. `GET {{baseUrl}}/ta/queue` → note a `submission_id`.
4. `GET {{baseUrl}}/ta/submissions/:id` → read the AI `criteria`.
5. `POST {{baseUrl}}/ta/submissions/:id/release`:
   - Send the AI criteria unchanged → **422** (guardrail blocks rubber-stamping).
   - Edit feedback on ≥2 criteria (add a real sentence) → **200 released**.
   - Or send `"attest_no_edits": true` with an `overall_comment` → **202** routed
     to instructor approval.

## Security notes

- All SQL uses **parameterized queries** (`$1, $2, …`) — no string concatenation,
  so user input cannot alter query structure (SQL-injection mitigation).
- The caller's **role is read from the database**, never trusted from the JWT
  claims, and ownership is checked per request (broken-access-control mitigation).
- Passwords are stored as **bcrypt** hashes (cost 12); login returns a generic
  message to avoid user enumeration.
- Every release / block / escalation writes an **audit_log** entry.

## Files

```
src/index.js                 app bootstrap + error handler
src/db.js                    pg connection pool
src/middleware/auth.js       JWT verify + DB-backed role check (RBAC)
src/controllers/authController.js    register / login
src/controllers/reviewController.js  queue / review detail / release
src/services/editIntegrity.js        review-integrity guardrail
src/routes/index.js          route table
db/schema.sql                full schema (all entities)
db/seed.sql / db/seed.json   database source data with demo content
scripts/migrate.js           apply schema
scripts/seed.js              insert demo data
render.yaml                  Render blueprint (web + Postgres)
```
