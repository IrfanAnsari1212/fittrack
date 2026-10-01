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

### Nutrition data (Module 3A)

- **Planned** (DietPlan → DietPlanMeal → DietPlanMealFood → Food, assigned via DietPlanAssignment) is separate from **actual** consumption (DailyNutritionLog, whose entries snapshot nutrition at logging time).
- Member-owned services (goals, assignments, logs) take a `MemberTarget` from `selfTarget(member)`, `gymMemberTarget(admin, memberId)` or `platformMemberTarget(superAdmin, memberId)` (read-only) — never a raw userId.
- Services validate their own input with Zod (`src/lib/validations/nutrition.ts`) and throw `ValidationError` / `DomainError`; `domainErrorState()` turns those into form errors.
- Nutrition math lives in `src/lib/nutrition/calculations.ts` (pure, tested). Days are `"YYYY-MM-DD"` strings.
- **Calendar dates are always supplied by the caller.** User-facing days — `getCurrentNutritionGoal(asOf)`, `setNutritionGoal({ effectiveFrom })`, `assignDietPlan({ startDate })`, `endDietPlanAssignment({ endDate })`, daily-log `date` — are required parameters, computed by the caller in the relevant user/gym timezone (e.g. in the browser: `new Intl.DateTimeFormat("en-CA").format(new Date())`). Services never fall back to the server's UTC clock, which is a day off from members near midnight and would store the wrong day; a missing date is a validation error. A stored per-user/per-gym timezone is not implemented yet.

### Nutrition UI (Module 3B)

- **Gym Admin:** Food Library (`/admin/foods`), Diet Plans + builder (`/admin/diet-plans/[planId]`), plan assignment and goals on the member page (`/admin/members/[memberId]`).
- **Member:** `/nutrition?date=YYYY-MM-DD` — goal, the plan that applies that day, actual logging, history by date. Without `?date` the browser redirects to its local today. The dashboard's nutrition widgets fetch with the browser's date.
- **Assigning over an active plan is refused** (`ACTIVE_ASSIGNMENT_EXISTS`) unless the admin explicitly confirms (`replaceActive`), which ends the old plan in the same transaction.
- **Planned ≠ consumed:** the meal checklist is derived from logged entries linked to a meal; ticking/opening a meal never records anything by itself.
- **Gym plans vs personal plans:** `DietPlan.ownerUserId = null` is a gym plan (admin library, assignable); a member id makes it that member's personal plan. The plan service derives the editable scope from the role — admins edit gym plans only, members only their own plans — so a member can never mutate a shared gym plan, and a personal plan can never be assigned to someone else.
- **Customize = copy:** "Customize" copies the member's assigned gym plan into a personal plan (`sourcePlanId`), ends the gym assignment on the member's local day and assigns the copy, in one transaction. Other members on the gym plan are unaffected; earlier days still resolve to the gym plan. Members can also create their own plans (`/nutrition/plans`) and switch to them (explicit replace rule). Goals: both member and admin can set them; history is kept per start day.
- Server actions live in `src/server/actions/{food,diet-plan,member-nutrition-admin,nutrition}-actions.ts` — they authenticate (`require*`) and delegate; validation and rules stay in the services.

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
