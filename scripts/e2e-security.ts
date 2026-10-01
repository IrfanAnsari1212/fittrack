/**
 * End-to-end security checks against the real production build:
 * proxy, Auth.js sessions, Data Access Layer and server actions over HTTP.
 *
 *   npm run build && npm run test:e2e
 *
 * Uses a throwaway in-memory MongoDB; never touches MONGODB_URI from .env.local.
 */
import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"

import { MongoMemoryReplSet } from "mongodb-memory-server"

import { disconnectFromDatabase } from "@/server/db/connect"
import { crossTenant } from "@/server/db/tenant-guard"
import { Gym } from "@/server/models/gym"
import { User } from "@/server/models/user"

import { devAccounts, seedDevelopmentData } from "./lib/seed-data"

const PORT = 3100
const BASE = `http://localhost:${PORT}`
const PASSWORD = "e2e-password-123"
const [gymA, gymB] = devAccounts.gyms

// ---------------------------------------------------------------- helpers

type Jar = Map<string, string>

function storeCookies(jar: Jar, response: Response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair, ...attrs] = header.split(";")
    const index = pair.indexOf("=")
    const name = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    const expired = attrs.some((a) => /max-age=0|expires=thu, 01 jan 1970/i.test(a.trim()))
    if (expired || value === "") jar.delete(name)
    else jar.set(name, value)
  }
}

async function request(
  jar: Jar,
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
) {
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    ...init,
    headers: { ...(cookie ? { cookie } : {}), ...init.headers },
  })
  storeCookies(jar, response)
  const body = await response.text()
  if (process.env.DEBUG_E2E && init.headers?.["next-action"]) console.log("ACTION", path, response.status, body.slice(0, 600))
  return { status: response.status, location: response.headers.get("location") ?? "", response, body }
}

/** Sign in through Auth.js' own credentials endpoint. */
async function login(email: string, password = PASSWORD) {
  const jar: Jar = new Map()
  const csrf = await request(jar, "/api/auth/csrf")
  const { csrfToken } = JSON.parse(csrf.body) as { csrfToken: string }
  const result = await request(jar, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: BASE }).toString(),
  })
  const ok = jar.has("authjs.session-token") && !result.location.includes("error=")
  return { jar, ok }
}

/** Read action ids from the build so we can call actions like a browser does. */
function actionId(file: string, exportName: string) {
  const manifest = JSON.parse(
    readFileSync(".next/server/server-reference-manifest.json", "utf8")
  ) as { node: Record<string, { filename?: string; exportedName?: string }> }
  const entry = Object.entries(manifest.node).find(
    ([, v]) => v.filename?.endsWith(file) && v.exportedName === exportName
  )
  if (!entry) throw new Error(`Action ${exportName} not found in manifest`)
  return entry[0]
}

/** Invoke a `(prevState, formData)` server action with arbitrary fields. */
async function callFormAction(
  jar: Jar,
  path: string,
  id: string,
  fields: Record<string, string>
) {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.append(`_1_${key}`, value) // React reply format: <prefix>_<formDataId>_<field>
  body.append("0", JSON.stringify([{}, "$K1"]))
  return request(jar, path, {
    method: "POST",
    headers: { "next-action": id, origin: BASE, accept: "text/x-component" },
    body,
  })
}

const results: { check: string; pass: boolean; detail: string }[] = []
function check(name: string, pass: boolean, detail = "") {
  results.push({ check: name, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail && !pass ? `  → ${detail}` : ""}`)
}

const isForbidden = (r: { status: number; body: string }) =>
  r.status === 403 || (r.status === 307 && false)
const redirectsTo = (r: { status: number; location: string }, path: string) =>
  [302, 303, 307, 308].includes(r.status) && new URL(r.location, BASE).pathname === path

// ---------------------------------------------------------------- run

async function run() {
  const memberIds = Object.fromEntries(
    await Promise.all(
      [...gymA.members, ...gymB.members].map(async (m) => {
        const user = await crossTenant(User.findOne({ email: m.email })).lean()
        return [m.email, user!._id.toString()] as const
      })
    )
  )
  const a1 = memberIds[gymA.members[0].email]
  const a2 = memberIds[gymA.members[1].email]
  const b1 = memberIds[gymB.members[0].email]

  // --- Authentication
  const anonymous: Jar = new Map()
  const c1 = await request(anonymous, "/dashboard")
  check(
    "Case 1: anonymous /dashboard → redirected to /login",
    redirectsTo(c1, "/login") && c1.location.includes("callbackUrl=%2Fdashboard"),
    `${c1.status} ${c1.location}`
  )
  for (const path of ["/admin/members", "/super-admin", "/profile"]) {
    const r = await request(anonymous, path)
    check(`anonymous ${path} → redirected to /login`, redirectsTo(r, "/login"), `${r.status} ${r.location}`)
  }

  const member = await login(gymA.members[0].email)
  const adminA = await login(gymA.admin.email)
  const adminB = await login(gymB.admin.email)
  const superAdmin = await login(devAccounts.superAdmin.email)
  check("login works for all three roles", member.ok && adminA.ok && adminB.ok && superAdmin.ok)
  check("wrong password is rejected", !(await login(gymA.admin.email, "wrong-password")).ok)

  const session = JSON.parse((await request(member.jar, "/api/auth/session")).body) as {
    user: Record<string, unknown>
  }
  check(
    "session exposes only safe fields",
    Object.keys(session.user).sort().join(",") === "email,gymId,id,image,name,role" &&
      !JSON.stringify(session).includes("passwordHash") &&
      session.user.role === "MEMBER",
    JSON.stringify(session.user)
  )

  const first = await request(member.jar, "/dashboard")
  const again = await request(member.jar, "/dashboard")
  check(
    "session persists across requests (refresh)",
    first.status === 200 && again.status === 200 && again.body.includes("Welcome back"),
    `${first.status}/${again.status}`
  )

  // --- Roles
  const c2 = await request(member.jar, "/admin")
  check("Case 2: MEMBER → /admin denied (403)", isForbidden(c2) && c2.body.includes("Access denied"), String(c2.status))
  const c3 = await request(member.jar, "/super-admin")
  check("Case 3: MEMBER → /super-admin denied (403)", isForbidden(c3), String(c3.status))
  const c4 = await request(adminA.jar, "/super-admin/gyms")
  check("Case 4: GYM_ADMIN → /super-admin denied (403)", isForbidden(c4), String(c4.status))
  const memberOther = await request(member.jar, `/admin/members/${a2}`)
  check("MEMBER cannot open another member's record", isForbidden(memberOther), String(memberOther.status))
  const adminOnMember = await request(adminA.jar, "/dashboard")
  check("GYM_ADMIN cannot open member-only pages", isForbidden(adminOnMember), String(adminOnMember.status))

  for (const path of ["/super-admin", "/super-admin/gyms", "/super-admin/users", "/super-admin/gyms/new"]) {
    const r = await request(superAdmin.jar, path)
    check(`Case 8: SUPER_ADMIN → ${path} (200)`, r.status === 200, String(r.status))
  }
  const gymsPage = await request(superAdmin.jar, "/super-admin/gyms")
  check("Super Admin sees every gym", gymsPage.body.includes(gymA.gymName) && gymsPage.body.includes(gymB.gymName))
  for (const path of ["/admin", "/admin/members", "/admin/settings", `/admin/members/${a1}`]) {
    const r = await request(adminA.jar, path)
    check(`GYM_ADMIN → ${path} (200)`, r.status === 200, String(r.status))
  }

  // --- Tenant isolation
  const listA = await request(adminA.jar, "/admin/members")
  check(
    "Case 5: Gym A admin sees only Gym A members",
    gymA.members.every((m) => listA.body.includes(m.email)) &&
      gymB.members.every((m) => !listA.body.includes(m.email))
  )
  const listB = await request(adminB.jar, "/admin/members")
  check(
    "Case 5: Gym B admin sees only Gym B members",
    gymB.members.every((m) => listB.body.includes(m.email)) &&
      gymA.members.every((m) => !listB.body.includes(m.email))
  )
  const c6 = await request(adminA.jar, `/admin/members/${b1}`)
  check(
    "Case 6: Gym A admin → Gym B member denied (404, no data)",
    c6.status === 404 && !c6.body.includes(gymB.members[0].email),
    String(c6.status)
  )
  const c6b = await request(adminB.jar, `/admin/members/${a1}/edit`)
  check("Case 6: Gym B admin → Gym A member edit denied (404)", c6b.status === 404, String(c6b.status))

  // Case 7 — call the real server action with a forged gymId (and role).
  const createId = actionId("src/server/actions/member-actions.ts", "createMemberAction")
  const forgedEmail = "forged.e2e@fittrack.test"
  const gymBId = (await crossTenant(User.findOne({ email: gymB.admin.email })).lean())!.gymId!.toString()
  const c7 = await callFormAction(adminA.jar, "/admin/members/new", createId, {
    name: "Forged Member",
    email: forgedEmail,
    password: "forged-password-1",
    gymId: gymBId,
    role: "GYM_ADMIN",
  })
  const forged = await crossTenant(User.findOne({ email: forgedEmail })).lean()
  check(
    "Case 7: forged gymId/role ignored — member created in admin's own gym",
    Boolean(forged) &&
      forged!.gymId?.toString() !== gymBId &&
      forged!.gymId?.toString() === (await crossTenant(User.findOne({ email: gymA.admin.email })).lean())!.gymId?.toString() &&
      forged!.role === "MEMBER",
    `status ${c7.status}, created=${Boolean(forged)}`
  )

  // --- Super Admin creates a gym through the real form action.
  const createGymId = actionId("src/server/actions/gym-actions.ts", "createGymAction")
  const newGym = await callFormAction(superAdmin.jar, "/super-admin/gyms/new", createGymId, {
    gymName: "E2E Gym C",
    adminName: "Cara Admin (Gym C)",
    adminEmail: "admin.c@fittrack.test",
    adminPassword: PASSWORD,
  })
  const gymC = await Gym.findOne({ name: "E2E Gym C" }).lean()
  const adminC = await crossTenant(User.findOne({ email: "admin.c@fittrack.test" })).lean()
  check(
    "Super Admin creates gym + admin (linked both ways)",
    Boolean(gymC && adminC) &&
      adminC!.role === "GYM_ADMIN" &&
      adminC!.gymId?.toString() === gymC!._id.toString() &&
      gymC!.ownerId.toString() === adminC!._id.toString(),
    `status ${newGym.status}`
  )
  const adminCLogin = await login("admin.c@fittrack.test")
  const listC = await request(adminCLogin.jar, "/admin/members")
  check(
    "new gym's admin can log in and sees an empty, isolated member list",
    adminCLogin.ok && listC.status === 200 && !listC.body.includes("fittrack.test</") &&
      [...gymA.members, ...gymB.members].every((m) => !listC.body.includes(m.email))
  )
  const gymByAdmin = await callFormAction(adminA.jar, "/super-admin/gyms/new", createGymId, {
    gymName: "Sneaky Gym",
    adminName: "Sneaky",
    adminEmail: "sneaky@fittrack.test",
    adminPassword: PASSWORD,
  })
  check(
    "Gym Admin cannot invoke the create-gym action",
    !(await Gym.exists({ name: "Sneaky Gym" })),
    `status ${gymByAdmin.status}`
  )

  // --- The Data Access Layer re-checks the DB, so a stale JWT can't win.
  const demoted = await login(gymA.admin.email)
  await crossTenant(User.updateOne({ email: gymA.admin.email }, { $set: { role: "MEMBER" } }))
  const stalePage = await request(demoted.jar, "/admin/members")
  check(
    "stale token (role changed in DB) → page denied by DAL even though proxy allows",
    redirectsTo(stalePage, "/forbidden") || stalePage.status === 403,
    `${stalePage.status} ${stalePage.location}`
  )
  const staleAction = await callFormAction(demoted.jar, "/admin/members/new", createId, {
    name: "Stale Admin Member",
    email: "stale.e2e@fittrack.test",
    password: "stale-password-1",
  })
  check(
    "stale token → server action refuses to create a member",
    !(await crossTenant(User.exists({ email: "stale.e2e@fittrack.test" }))),
    `status ${staleAction.status}`
  )
  await crossTenant(User.updateOne({ email: gymA.admin.email }, { $set: { role: "GYM_ADMIN" } }))

  // --- Disabled users and suspended gyms
  const a2Session = await login(gymA.members[1].email)
  await crossTenant(User.updateOne({ _id: a2 }, { $set: { status: "DISABLED" } }))
  check("disabled member cannot log in", !(await login(gymA.members[1].email)).ok)
  const disabledPage = await request(a2Session.jar, "/dashboard")
  check(
    "disabled member's existing session is rejected",
    redirectsTo(disabledPage, "/login") && disabledPage.location.includes("account_unavailable"),
    `${disabledPage.status} ${disabledPage.location}`
  )
  await crossTenant(User.updateOne({ _id: a2 }, { $set: { status: "ACTIVE" } }))

  await Gym.updateOne({ _id: gymBId }, { $set: { status: "SUSPENDED" } })
  const suspended = await request(adminB.jar, "/admin")
  check("suspended gym's admin is locked out", redirectsTo(suspended, "/login"), `${suspended.status} ${suspended.location}`)
  check("other gyms keep working while one is suspended", (await request(adminA.jar, "/admin")).status === 200)
  await Gym.updateOne({ _id: gymBId }, { $set: { status: "ACTIVE" } })

  // --- UI login action + logout
  const loginId = actionId("src/server/actions/auth-actions.ts", "loginAction")
  const uiJar: Jar = new Map()
  const uiLogin = await callFormAction(uiJar, "/login", loginId, {
    email: gymB.admin.email,
    password: PASSWORD,
  })
  check(
    "login form action signs in and redirects Gym Admin to /admin",
    uiJar.has("authjs.session-token") && (uiLogin.response.headers.get("x-action-redirect") ?? "").startsWith("/admin"),
    `${uiLogin.status} ${uiLogin.response.headers.get("x-action-redirect")}`
  )
  const badJar: Jar = new Map()
  const badLogin = await callFormAction(badJar, "/login", loginId, { email: gymB.admin.email, password: "nope-nope" })
  check(
    "login form action reports invalid credentials",
    !badJar.has("authjs.session-token") && badLogin.body.includes("Invalid email or password")
  )

  const logoutId = actionId("src/server/actions/auth-actions.ts", "logoutAction")
  await request(uiJar, "/admin", {
    method: "POST",
    headers: { "next-action": logoutId, origin: BASE, accept: "text/x-component" },
    body: "[]",
  })
  const afterLogout = await request(uiJar, "/admin")
  check("logout clears the session", !uiJar.has("authjs.session-token") && redirectsTo(afterLogout, "/login"), `${afterLogout.status}`)
}

// ---------------------------------------------------------------- main

async function main() {
  if (!existsSync(".next/BUILD_ID")) throw new Error("Run `npm run build` first.")

  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ launchTimeout: 60_000 }],
  })
  const uri = replSet.getUri("fittrack-e2e")
  process.env.MONGODB_URI = uri
  await seedDevelopmentData(PASSWORD)

  let server: ChildProcess | undefined
  try {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
      env: {
        ...process.env,
        MONGODB_URI: uri,
        AUTH_SECRET: randomBytes(32).toString("base64"),
        AUTH_TRUST_HOST: "true",
      },
      stdio: ["ignore", "ignore", "inherit"],
    })
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(`${BASE}/register`)).ok) break
      } catch {}
      if (i > 120) throw new Error("next start did not become ready")
      await new Promise((r) => setTimeout(r, 500))
    }

    await run()
  } finally {
    server?.kill()
    await disconnectFromDatabase()
    await replSet.stop()
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
