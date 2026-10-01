# FitTrack

Multi-tenant fitness platform for gyms — Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui (Base UI), Auth.js v5, MongoDB/Mongoose.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in MONGODB_URI and AUTH_SECRET
npm run create-super-admin          # your real platform admin account
npm run dev                          # http://localhost:3000
```

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | yes | Must be a **replica set** (MongoDB Atlas, or `npm run db:dev`) — gym creation uses transactions. |
| `AUTH_SECRET` | yes | `npx auth secret` or `openssl rand -base64 32`. |
| `AUTH_TRUST_HOST` | for `next start` | `true` when not deployed on Vercel. |
| `SEED_PASSWORD` | no | Password for seeded dev accounts (default `FitTrack-dev-only-123`). |

Real values live only in `.env.local` (git-ignored). `.env.example` holds placeholders.

> **Windows + Atlas:** if you see `querySrv ECONNREFUSED`, Node can't do DNS SRV lookups on your network. Use Atlas' *standard* connection string (`mongodb://host1,host2,host3/...?tls=true&replicaSet=...&authSource=admin`) instead of `mongodb+srv://`.

### Database options

- **Atlas (recommended):** paste the connection string into `.env.local`, add `/fittrack` as the database name.
- **Local, zero-install:** `npm run db:dev` starts an in-memory replica set on port 27018 and prints its URI. Data is lost when stopped.

### First Super Admin

```bash
npm run create-super-admin
```

Prompts for name, email and password (hidden) and creates a platform Super Admin in the database from `MONGODB_URI`. Log in with it, then create gyms from **Super Admin → Gyms → New gym**. Safe to re-run for additional Super Admins; existing emails are refused.

### Seed data (optional, fake)

```bash
npm run db:seed                    # local databases
npm run db:seed -- --allow-remote  # e.g. a development Atlas cluster
```

Idempotent (skips existing emails, never deletes) and refuses to run with `NODE_ENV=production`. Creates:

| Role | Gym | Email |
|---|---|---|
| Super Admin | — | `superadmin@fittrack.test` |
| Gym Admin | Dev Gym A | `admin.a@fittrack.test` |
| Member | Dev Gym A | `member.a1@fittrack.test`, `member.a2@fittrack.test` |
| Gym Admin | Dev Gym B | `admin.b@fittrack.test` |
| Member | Dev Gym B | `member.b1@fittrack.test`, `member.b2@fittrack.test` |

All use `SEED_PASSWORD` (default `FitTrack-dev-only-123`). These are fake development credentials only.

### Tests

```bash
npm test                            # service-level tenant isolation + auth (in-memory MongoDB)
npm run build && npm run test:e2e   # HTTP security checks against the production build
```

Both use a throwaway in-memory MongoDB; they never touch `MONGODB_URI`.

## Architecture

### Tenancy

- `Gym` is the tenant. `User.gymId` links gym users (GYM_ADMIN, MEMBER) to it; SUPER_ADMIN has `gymId: null`.
- `Gym.ownerId` is the primary admin. Extra admins are just more `GYM_ADMIN` users with the same `gymId`.
- Email is globally unique (one login identity across the platform).

### Rules for every future module

1. **Get the user from the DAL** — `requireAuth / requireMember / requireGymAdmin / requireSuperAdmin` (`src/server/auth/session.ts`) at the top of **every page and server action**. Layout checks alone are not enough.
2. **Never accept `gymId`/`userId`/`role` from the client.** Input schemas (`src/lib/validations`) don't contain them; services take them from the session context.
3. **Scope every tenant query** with `scopeToGym(ctx, filter)` or `scopeToMember(ctx, filter)` (`src/server/tenant.ts`). New gym-owned models (Meal, Workout, …) get `gymId` + `userId` fields and `schema.plugin(tenantGuardPlugin)`.
4. **The tenant guard throws on unscoped queries.** Intentional cross-tenant reads (login, Super Admin reports) must be wrapped in `crossTenant(query)` so they're easy to audit. `populate()` of tenant models is blocked — fetch them explicitly.

### Where things live

```
src/
  auth.ts, auth.config.ts   Auth.js (credentials, JWT session)
  proxy.ts                  Optimistic route gate (redirect / 403), no DB access
  app/
    (marketing)/            Landing
    (auth)/                 Login, "get an account" notice (no public sign-up)
    (app)/                  Signed-in shell (role-aware nav)
      (member)/             Member pages (dashboard, nutrition, …)
      admin/                Gym Admin: dashboard, members, settings
      super-admin/          Super Admin: dashboard, gyms, users
      profile/              Own profile (all roles)
    forbidden/              403 page
  server/                   Server-only code
    auth/                   DAL (session.ts), credential checks, guards
    actions/                Server actions (validate → require* → service)
    services/               All DB access, tenant-scoped
    models/                 Mongoose models
    db/                     Connection, tenant guard plugin
    tenant.ts               scopeToGym / scopeToMember
  lib/                      Shared (client-safe) code: roles, route access, validation, navigation
  types/                    Shared types and DTOs
scripts/                    seed, dev-db, e2e security checks
tests/                      Service-level security tests
```
