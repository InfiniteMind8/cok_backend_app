# cok-api — City of Karis backend

Standalone backend service for the [City of Karis](https://github.com/InfiniteMind8/cok-app) community app. Hono on Node 20+ with Prisma 7 + Postgres (Supabase).

> **Companion repo:** the frontend (Next.js 16) lives at `github.com/InfiniteMind8/cok-app`. The frontend talks to this backend over HTTPS with Clerk JWTs.

## Quick start

```bash
# 1. Install
pnpm install

# 2. Copy env and fill in values (see .env.example for documentation)
cp .env.example .env
# DATABASE_URL must point at the same Supabase project as the frontend.

# 3. Generate Prisma client + apply migrations
pnpm prisma:generate
pnpm prisma:migrate:deploy

# 4. Seed (system wallets, fee schedule, demo accounts, etc.)
pnpm db:seed
pnpm db:seed:demo
pnpm db:seed:history

# 5. Start dev server (default port 4000)
pnpm dev
```

Then `curl http://localhost:4000/health` should return `{ "ok": true }`.

## Architecture

```
src/
├── index.ts              ← @hono/node-server entrypoint (reads PORT)
├── server.ts             ← Hono app composition (routes + middleware)
├── middleware/
│   ├── auth.ts           ← Clerk JWT verification (Authorization: Bearer)
│   ├── cors.ts           ← origin allowlist from CORS_ORIGINS
│   ├── error.ts          ← envelope { ok, data | error } responder + Sentry
│   ├── logging.ts        ← pino structured logging
│   └── rate-limit.ts     ← Upstash + in-memory fallback
├── lib/                  ← business logic (audit, ledger, currency, email,
│                            storage, mfa, queries, etc.) — moved from the
│                            monolith's website/lib/
├── routes/
│   ├── admin/            ← admin endpoints (treasury, approvals, broadcasts,
│   │                        imports, audit-log, data-directory, settings…)
│   ├── resident/         ← resident endpoints (wallet, profile, community)
│   └── system/           ← internal/system routes (sentry-test, health)
├── webhooks/
│   └── clerk.ts          ← Svix-signed webhook handler
├── cron/
│   ├── leases.ts         ← lease cycle transitions
│   └── reconciliation.ts ← treasury reconciliation
└── services/             ← multi-table business logic that crosses lib/ boundaries

prisma/
├── schema.prisma         ← single source of truth for the DB schema
├── migrations/           ← all 7+ Phase 1+ migrations preserved
├── seed/                 ← seed scripts (moved from website/lib/seed/)
└── rls/                  ← RLS policy SQL + apply/verify scripts (Phase 2 Block C)
```

## Endpoint contract

All responses use an envelope:
```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { ... } } }
```

Standard error codes:
- `UNAUTHORIZED` (401) — missing/invalid JWT
- `FORBIDDEN` (403) — auth ok but role/scope insufficient
- `NOT_FOUND` (404)
- `VALIDATION_ERROR` (400) — Zod schema violation
- `RATE_LIMITED` (429) — Upstash rate limit hit
- `INTERNAL_ERROR` (500) — unexpected; correlate with Sentry id

Auth is via `Authorization: Bearer <Clerk JWT>`. The frontend obtains the JWT via `clerk.session.getToken()` and includes it on every request.

## Deployment

| Target | How |
|---|---|
| Vercel | Functions; configure rewrites to point cron at `/cron/*` |
| Fly.io | `fly launch` with `Dockerfile`; long-running process; native cron |
| Railway / Render | Dockerfile or autodetect Node; configure cron in dashboard |
| Cloudflare Workers | Hono adapter exists, but Prisma + node-pg currently require Node runtime; use `@prisma/adapter-pg-worker` if/when migrating |

Recommended: Vercel for parity with the frontend's deploy target.

## Reference

- Frontend repo: <https://github.com/InfiniteMind8/cok-app>
- Phase 2 split playbook: `../website/project-breakdown.md`
- Phase 1+ closure handover: `../website/PROJECT-HANDOVER.md`
