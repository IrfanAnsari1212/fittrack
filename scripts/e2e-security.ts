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
import { DailyNutritionLog } from "@/server/models/daily-nutrition-log"
import { DietPlan } from "@/server/models/diet-plan"
import { DietPlanAssignment } from "@/server/models/diet-plan-assignment"
import { DietPlanMeal } from "@/server/models/diet-plan-meal"
import { DietPlanMealFood } from "@/server/models/diet-plan-meal-food"
import { Food } from "@/server/models/food"
import { Exercise } from "@/server/models/exercise"
import { ExerciseSession } from "@/server/models/exercise-session"
import { Gym } from "@/server/models/gym"
import { SetLog } from "@/server/models/set-log"
import { WorkoutPlan } from "@/server/models/workout-plan"
import { WorkoutPlanAssignment } from "@/server/models/workout-plan-assignment"
import { WorkoutPlanDay } from "@/server/models/workout-plan-day"
import { WorkoutPlanExercise } from "@/server/models/workout-plan-exercise"
import { WorkoutSession } from "@/server/models/workout-session"
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

/**
 * Invoke a `(...bound, prevState, formData)` server action with arbitrary
 * fields. Bound args are sent by the client too, so tests may forge them.
 */
async function callFormAction(
  jar: Jar,
  path: string,
  id: string,
  fields: Record<string, string>,
  bound: unknown[] = []
) {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.append(`_1_${key}`, value) // React reply format: <prefix>_<formDataId>_<field>
  body.append("0", JSON.stringify([...bound, {}, "$K1"]))
  return request(jar, path, {
    method: "POST",
    headers: { "next-action": id, origin: BASE, accept: "text/x-component" },
    body,
  })
}

/** Invoke a server action with plain JSON-serializable arguments. */
async function jsonAction(jar: Jar, path: string, id: string, args: unknown[]) {
  return request(jar, path, {
    method: "POST",
    headers: { "next-action": id, origin: BASE, accept: "text/x-component" },
    body: JSON.stringify(args),
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

// ---------------------------------------------------------------- nutrition (Module 3B)

const ok = (r: { body: string }) => r.body.includes('"ok":true')

async function runNutrition() {
  console.log("\n── Nutrition (Module 3B)")
  const idOf = async (email: string) => (await crossTenant(User.findOne({ email })).lean())!._id.toString()
  const gymOf = async (email: string) => (await crossTenant(User.findOne({ email })).lean())!.gymId!.toString()
  const a1 = await idOf(gymA.members[0].email)
  const a2 = await idOf(gymA.members[1].email)
  const b1 = await idOf(gymB.members[0].email)
  const adminAId = await idOf(gymA.admin.email)
  const gymAId = await gymOf(gymA.admin.email)
  const gymBId = await gymOf(gymB.admin.email)

  const adminA = await login(gymA.admin.email)
  const adminB = await login(gymB.admin.email)
  const memberA1 = await login(gymA.members[0].email)
  const memberA2 = await login(gymA.members[1].email)
  const DAY = "2026-10-01" // the member's local day, as the browser would send it

  const act = (file: string, name: string) => actionId(`src/server/actions/${file}.ts`, name)
  const saveFood = act("food-actions", "saveFoodAction")
  const createPlan = act("diet-plan-actions", "createDietPlanAction")
  const addMeal = act("diet-plan-actions", "addMealAction")
  const addMealFood = act("diet-plan-actions", "addMealFoodAction")
  const assignPlan = act("member-nutrition-admin-actions", "assignDietPlanAction")
  const logFood = act("nutrition-actions", "logConsumptionAction")
  const removeEntry = act("nutrition-actions", "removeConsumedEntryAction")
  const getDay = act("nutrition-actions", "getNutritionDayAction")

  // Food library — forged gymId ignored; other gym can't edit.
  const fr = await callFormAction(adminA.jar, "/admin/foods", saveFood, {
    name: "E2E Eggs", servingSize: "1", servingUnit: "piece", calories: "70", protein: "6", gymId: gymBId,
  }, [null])
  const eggs = await Food.findOne({ gymId: gymAId, name: "E2E Eggs" }).lean()
  check("admin creates food via action; forged gymId ignored", Boolean(eggs) && !(await Food.exists({ gymId: gymBId, name: "E2E Eggs" })), `status ${fr.status}`)
  const eggsId = eggs!._id.toString()
  await callFormAction(adminB.jar, "/admin/foods", saveFood, {
    name: "Hijacked", servingSize: "1", servingUnit: "piece", calories: "1", protein: "1",
  }, [eggsId])
  check("other gym's admin cannot edit the food", (await Food.findOne({ gymId: gymAId, _id: eggsId }).lean())?.name === "E2E Eggs")
  const foodsA = await request(adminA.jar, "/admin/foods")
  const foodsB = await request(adminB.jar, "/admin/foods")
  check("food library pages are tenant-scoped", foodsA.status === 200 && foodsA.body.includes("E2E Eggs") && !foodsB.body.includes("E2E Eggs"))

  // Diet plan builder — createdBy/gymId forged, then meals and foods.
  const created = await callFormAction(adminA.jar, "/admin/diet-plans", createPlan, {
    name: "E2E Muscle Gain", createdBy: a1, gymId: gymBId,
  })
  const plan = await DietPlan.findOne({ gymId: gymAId, name: "E2E Muscle Gain" }).lean()
  const planId = plan?._id.toString() ?? ""
  check(
    "admin creates plan via action; createdBy/gymId come from session",
    Boolean(plan) && plan!.createdBy.toString() === adminAId && (created.response.headers.get("x-action-redirect") ?? "").includes(planId)
  )
  check("admin adds a meal", ok(await callFormAction(adminA.jar, `/admin/diet-plans/${planId}`, addMeal, { name: "Breakfast", time: "08:00" }, [planId])) || Boolean(await DietPlanMeal.exists({ gymId: gymAId, dietPlanId: planId })))
  const meal = await DietPlanMeal.findOne({ gymId: gymAId, dietPlanId: planId }).lean()
  const mealId = meal!._id.toString()
  await callFormAction(adminA.jar, `/admin/diet-plans/${planId}`, addMealFood, { foodId: eggsId, quantity: "4", unit: "piece" }, [planId, mealId])
  check("admin adds planned food (4 eggs)", (await DietPlanMealFood.countDocuments({ gymId: gymAId, dietPlanMealId: mealId })) === 1)
  check("other gym's admin gets 404 on the plan builder", (await request(adminB.jar, `/admin/diet-plans/${planId}`)).status === 404)
  const foodB = await Food.create({ gymId: gymBId, name: "B only", servingSize: 1, servingUnit: "piece", calories: 10, protein: 1 })
  await callFormAction(adminB.jar, `/admin/diet-plans/${planId}`, addMealFood, { foodId: foodB._id.toString(), quantity: "1", unit: "piece" }, [planId, mealId])
  await callFormAction(adminA.jar, `/admin/diet-plans/${planId}`, addMealFood, { foodId: foodB._id.toString(), quantity: "1", unit: "piece" }, [planId, mealId])
  check("cross-gym meal/food combinations are refused", (await DietPlanMealFood.countDocuments({ gymId: gymAId, dietPlanMealId: mealId })) === 1)

  // Assignment — forged bound member, one-active rule with explicit replace.
  await callFormAction(adminA.jar, `/admin/members/${a1}`, assignPlan, { dietPlanId: planId, startDate: DAY }, [b1])
  check("admin cannot assign to another gym's member (forged bound id)", !(await DietPlanAssignment.exists({ gymId: gymBId, userId: b1 })) && !(await DietPlanAssignment.exists({ gymId: gymAId, userId: b1 })))
  await callFormAction(adminA.jar, "/admin/diet-plans", createPlan, { name: "E2E Empty Plan" })
  const emptyPlanId = (await DietPlan.findOne({ gymId: gymAId, name: "E2E Empty Plan" }).lean())!._id.toString()
  await callFormAction(adminA.jar, `/admin/members/${a1}`, assignPlan, { dietPlanId: emptyPlanId, startDate: DAY }, [a1])
  const conflict = await callFormAction(adminA.jar, `/admin/members/${a1}`, assignPlan, { dietPlanId: planId, startDate: DAY }, [a1])
  const activeAfterConflict = await DietPlanAssignment.findOne({ gymId: gymAId, userId: a1, status: "ACTIVE" }).lean()
  check(
    "assigning over an active plan is refused with a clear error",
    conflict.body.includes("ACTIVE_ASSIGNMENT_EXISTS") && activeAfterConflict?.dietPlanId.toString() === emptyPlanId
  )
  await callFormAction(adminA.jar, `/admin/members/${a1}`, assignPlan, { dietPlanId: planId, startDate: DAY, replaceActive: "true", assignedBy: a1 }, [a1])
  const active = await DietPlanAssignment.findOne({ gymId: gymAId, userId: a1, status: "ACTIVE" }).lean()
  check(
    "explicit replace swaps the plan; assignedBy from session",
    active?.dietPlanId.toString() === planId && active.assignedBy.toString() === adminAId && active.startDate === DAY &&
      (await DietPlanAssignment.countDocuments({ gymId: gymAId, userId: a1, status: "ACTIVE" })) === 1
  )

  // Member logging — forged userId/gymId ignored; snapshot survives food edit.
  const logged = await jsonAction(memberA1.jar, "/nutrition", logFood, [
    DAY,
    { dietPlanMealId: mealId, items: [{ foodId: eggsId, quantity: "3", unit: "piece" }], userId: a2, gymId: gymBId },
  ])
  const logA1 = await DailyNutritionLog.findOne({ gymId: gymAId, userId: a1, date: DAY }).lean()
  check(
    "member logs 3 of 4 planned eggs → 210 kcal / 18 g (snapshot)",
    ok(logged) && logA1?.entries.length === 1 && logA1.entries[0].calories === 210 && logA1.entries[0].protein === 18 &&
      !(await DailyNutritionLog.exists({ gymId: gymAId, userId: a2, date: DAY }))
  )
  await callFormAction(adminA.jar, "/admin/foods", saveFood, {
    name: "E2E Eggs", servingSize: "1", servingUnit: "piece", calories: "80", protein: "7",
  }, [eggsId])
  const afterEdit = await DailyNutritionLog.findOne({ gymId: gymAId, userId: a1, date: DAY }).lean()
  check("historical log unchanged after admin edits the food", afterEdit?.entries[0].calories === 210 && afterEdit.entries[0].protein === 18)
  const dayView = await jsonAction(memberA1.jar, "/dashboard", getDay, [DAY])
  check("member day view returns actual consumption", ok(dayView) && dayView.body.includes('"calories":210'))

  const entryId = afterEdit!.entries[0]._id.toString()
  const steal = await jsonAction(memberA2.jar, "/nutrition", removeEntry, [DAY, entryId])
  check("another member cannot remove the entry", !ok(steal) && (await DailyNutritionLog.findOne({ gymId: gymAId, userId: a1, date: DAY }).lean())?.entries.length === 1)
  const badDate = await jsonAction(memberA1.jar, "/nutrition", logFood, ["2026-13-01", { items: [{ foodId: eggsId, quantity: 1, unit: "piece" }] }])
  check("invalid calendar date is rejected", !ok(badDate))

  // Pages.
  const page = await request(memberA1.jar, `/nutrition?date=${DAY}`)
  check("member nutrition page shows plan and actual entries", page.status === 200 && page.body.includes("E2E Muscle Gain") && page.body.includes("E2E Eggs"))
  const otherPage = await request(memberA2.jar, `/nutrition?date=${DAY}`)
  check("another member's nutrition page shows none of it", otherPage.status === 200 && !otherPage.body.includes("E2E Muscle Gain") && otherPage.body.includes("No active diet plan for today."))
  const noDate = await request(memberA1.jar, "/nutrition")
  check("without ?date the server does not pick a day (client redirect)", noDate.status === 200 && noDate.body.includes("Loading nutrition"))
  check("member dashboard renders", (await request(memberA1.jar, "/dashboard")).status === 200)
  const memberPage = await request(adminA.jar, `/admin/members/${a1}`)
  check("admin member page shows the assigned plan", memberPage.status === 200 && memberPage.body.includes("E2E Muscle Gain"))
  const memberCreatesPlan = await callFormAction(memberA1.jar, "/admin/diet-plans", createPlan, { name: "Member plan" })
  check(
    "a member can never create a GYM plan (admin route refused; any plan they create is personal)",
    memberCreatesPlan.status >= 400 &&
      !(await DietPlan.exists({ gymId: gymAId, name: "Member plan", ownerUserId: null })),
    `status ${memberCreatesPlan.status}`
  )
}

// ---------------------------------------------------------------- member-owned diets

async function runPersonalPlans() {
  console.log("\n── Member-owned diets")
  const idOf = async (email: string) => (await crossTenant(User.findOne({ email })).lean())!._id.toString()
  const gymAId = (await crossTenant(User.findOne({ email: gymA.admin.email })).lean())!.gymId!.toString()
  const a1 = await idOf(gymA.members[0].email)
  const memberA1 = await login(gymA.members[0].email)
  const adminA = await login(gymA.admin.email)
  const gymPlan = (await DietPlan.findOne({ gymId: gymAId, name: "E2E Muscle Gain", ownerUserId: null }).lean())!
  const gymPlanId = gymPlan._id.toString()
  const gymMealId = (await DietPlanMeal.findOne({ gymId: gymAId, dietPlanId: gymPlanId }).lean())!._id.toString()
  const gymSnapshot = async () =>
    JSON.stringify({
      plan: (await DietPlan.findOne({ gymId: gymAId, _id: gymPlanId }).lean())?.name,
      meals: (await DietPlanMeal.find({ gymId: gymAId, dietPlanId: gymPlanId }).lean()).map((m) => [m.name, m.time]),
      foods: (await DietPlanMealFood.find({ gymId: gymAId, dietPlanId: gymPlanId }).lean()).map((f) => [f.foodId.toString(), f.quantity]),
    })
  const before = await gymSnapshot()

  const act = (file: string, name: string) => actionId(`src/server/actions/${file}.ts`, name)
  const createPlan = act("diet-plan-actions", "createDietPlanAction")
  const addMeal = act("diet-plan-actions", "addMealAction")
  const updatePlan = act("diet-plan-actions", "updateDietPlanAction")
  const customize = act("nutrition-actions", "customizeMyDietPlanAction")

  // Member creates and edits their own plan through the real actions.
  const created = await callFormAction(memberA1.jar, "/nutrition/plans", createPlan, { name: "E2E My Plan", gymId: "x", createdBy: "y" })
  const mine = await DietPlan.findOne({ gymId: gymAId, name: "E2E My Plan" }).lean()
  const mineId = mine?._id.toString() ?? ""
  check(
    "member creates own plan via action (owned by them, redirect to their builder)",
    mine?.ownerUserId?.toString() === a1 && mine.createdBy.toString() === a1 &&
      (created.response.headers.get("x-action-redirect") ?? "").startsWith(`/nutrition/plans/${mineId}`)
  )
  await callFormAction(memberA1.jar, `/nutrition/plans/${mineId}`, addMeal, { name: "Breakfast", time: "07:00" }, [mineId])
  check("member adds a meal to own plan", (await DietPlanMeal.countDocuments({ gymId: gymAId, dietPlanId: mineId })) === 1)
  check("member opens own plan builder (200)", (await request(memberA1.jar, `/nutrition/plans/${mineId}`)).status === 200)

  // The same actions can't reach the gym plan (forged bound ids from an allowed route).
  await callFormAction(memberA1.jar, `/nutrition/plans/${mineId}`, addMeal, { name: "Injected", time: "10:00" }, [gymPlanId])
  await callFormAction(memberA1.jar, `/nutrition/plans/${mineId}`, updatePlan, { name: "Hijacked" }, [gymPlanId])
  check("member cannot modify the gym's shared plan via builder actions", (await gymSnapshot()) === before)
  check("member gets 404 for a gym plan in the member builder", (await request(memberA1.jar, `/nutrition/plans/${gymPlanId}`)).status === 404)

  // Customize: A1 is on the gym plan (assigned in runNutrition) → personal copy.
  const res = await jsonAction(memberA1.jar, "/nutrition", customize, ["2026-10-03"])
  const copy = await DietPlan.findOne({ gymId: gymAId, ownerUserId: a1, sourcePlanId: gymPlanId }).lean()
  const active = await DietPlanAssignment.findOne({ gymId: gymAId, userId: a1, status: "ACTIVE" }).lean()
  check(
    "customize copies the gym plan for this member and switches to it",
    ok(res) && Boolean(copy) && active?.dietPlanId.toString() === copy!._id.toString() && active.assignedBy.toString() === a1 &&
      (await DietPlanMeal.countDocuments({ gymId: gymAId, dietPlanId: copy!._id })) === 1
  )
  check("the gym plan is unchanged after customizing", (await gymSnapshot()) === before)
  const copyMealId = (await DietPlanMeal.findOne({ gymId: gymAId, dietPlanId: copy!._id }).lean())!._id.toString()
  check("the copy's meals are new records", copyMealId !== gymMealId)

  // Admin view of the member's personal plan is read-only.
  const adminView = await request(adminA.jar, `/admin/diet-plans/${copy!._id}`)
  check("admin can view the member's personal plan (read-only)", adminView.status === 200 && adminView.body.includes("personal plan"))
  await callFormAction(adminA.jar, `/admin/diet-plans/${copy!._id}`, updatePlan, { name: "Admin rename" }, [copy!._id.toString()])
  check("admin cannot edit the member's personal plan", (await DietPlan.findOne({ gymId: gymAId, _id: copy!._id }).lean())?.name !== "Admin rename")
  check("admin's gym library excludes personal plans", !(await request(adminA.jar, "/admin/diet-plans")).body.includes("E2E My Plan"))
}

// ---------------------------------------------------------------- main

// ---------------------------------------------------------------- workouts (Module 4)

async function runWorkouts() {
  console.log("\n── Workouts (Module 4)")
  const idOf = async (email: string) => (await crossTenant(User.findOne({ email })).lean())!._id.toString()
  const a1 = await idOf(gymA.members[0].email)
  const a2 = await idOf(gymA.members[1].email)
  const b1 = await idOf(gymB.members[0].email)
  const gymAId = (await crossTenant(User.findOne({ email: gymA.admin.email })).lean())!.gymId!.toString()
  const gymBId = (await crossTenant(User.findOne({ email: gymB.admin.email })).lean())!.gymId!.toString()
  const adminA = await login(gymA.admin.email)
  const adminB = await login(gymB.admin.email)
  const memberA1 = await login(gymA.members[0].email)
  const memberA2 = await login(gymA.members[1].email)
  const memberB1 = await login(gymB.members[0].email)
  const DAY = "2026-10-01"
  const denied = (r: { status: number; location: string }) => r.status === 403 || redirectsTo(r, "/forbidden") || r.status === 404

  const act = (file: string, name: string) => actionId(`src/server/actions/${file}.ts`, name)
  const saveExercise = act("exercise-actions", "saveExerciseAction")
  const createPlan = act("workout-plan-actions", "createWorkoutPlanAction")
  const addDay = act("workout-plan-actions", "addWorkoutDayAction")
  const updatePlan = act("workout-plan-actions", "updateWorkoutPlanAction")
  const addPlanned = act("workout-plan-actions", "addPlannedExerciseAction")
  const updatePlanned = act("workout-plan-actions", "updatePlannedExerciseAction")
  const assign = act("member-workout-admin-actions", "assignWorkoutPlanAction")
  const customize = act("workout-actions", "customizeMyWorkoutPlanAction")
  const start = act("workout-actions", "startWorkoutAction")
  const updateSet = act("workout-actions", "updateSetAction")
  const addSet = act("workout-actions", "addSetAction")
  const finish = act("workout-actions", "finishWorkoutAction")
  const useMyPlan = act("workout-actions", "useMyWorkoutPlanAction")

  // Route access.
  for (const path of ["/admin/exercises", "/admin/workouts"]) {
    check(`member cannot open ${path}`, denied(await request(memberA1.jar, path)))
  }
  for (const path of ["/workouts", "/workouts/plans", "/workouts/history"]) {
    check(`gym admin cannot open member page ${path}`, denied(await request(adminA.jar, path)))
  }
  check("anonymous is sent to login for /workouts", redirectsTo(await request(new Map(), "/workouts"), "/login"))

  // Exercise library: admin creates (forged gymId ignored); members can't.
  await callFormAction(adminA.jar, "/admin/exercises", saveExercise, { name: "E2E Bench", muscleGroup: "Chest", category: "STRENGTH", gymId: gymBId }, [null])
  const bench = await Exercise.findOne({ gymId: gymAId, name: "E2E Bench" }).lean()
  check("admin creates an exercise in their own gym (forged gymId ignored)", Boolean(bench) && !(await Exercise.findOne({ gymId: gymBId, name: "E2E Bench" }).lean()))
  await callFormAction(memberA1.jar, "/admin/exercises", saveExercise, { name: "Member Exercise", muscleGroup: "Chest", category: "STRENGTH" }, [null])
  check("member cannot create an exercise", !(await Exercise.findOne({ gymId: gymAId, name: "Member Exercise" }).lean()))
  await callFormAction(adminB.jar, "/admin/exercises", saveExercise, { name: "Hacked", muscleGroup: "Core", category: "OTHER" }, [bench!._id.toString()])
  check("another gym's admin cannot edit the exercise", (await Exercise.findOne({ gymId: gymAId, _id: bench!._id }).lean())?.name === "E2E Bench")
  check("another gym's admin does not see the exercise", !(await request(adminB.jar, "/admin/exercises")).body.includes("E2E Bench"))

  // Gym plan via the real builder actions.
  const created = await callFormAction(adminA.jar, "/admin/workouts", createPlan, { name: "E2E PPL", gymId: gymBId, ownerUserId: a1, createdBy: a2 })
  const gymPlan = await WorkoutPlan.findOne({ gymId: gymAId, name: "E2E PPL" }).lean()
  const gymPlanId = gymPlan?._id.toString() ?? ""
  check(
    "admin creates a gym plan (ownerUserId null, forged owner/createdBy/gymId ignored)",
    Boolean(gymPlan) && gymPlan!.ownerUserId === null && gymPlan!.createdBy.toString() !== a2 &&
      (created.response.headers.get("x-action-redirect") ?? "").startsWith(`/admin/workouts/${gymPlanId}`)
  )
  await callFormAction(adminA.jar, `/admin/workouts/${gymPlanId}`, addDay, { name: "Push" }, [gymPlanId])
  const pushDay = (await WorkoutPlanDay.findOne({ gymId: gymAId, workoutPlanId: gymPlanId }).lean())!
  await callFormAction(adminA.jar, `/admin/workouts/${gymPlanId}`, addPlanned, { exerciseId: bench!._id.toString(), sets: "4", repsMin: "6", repsMax: "8", targetWeight: "80", restSeconds: "120" }, [gymPlanId, pushDay._id.toString()])
  const planned = await WorkoutPlanExercise.findOne({ gymId: gymAId, workoutPlanId: gymPlanId }).lean()
  check("admin builds the plan (day + planned exercise with targets)", planned?.sets === 4 && planned.repsMax === 8 && planned.targetWeight === 80)
  check("admin opens the builder (200)", (await request(adminA.jar, `/admin/workouts/${gymPlanId}`)).status === 200)
  check("another gym's admin gets 404 for the plan", (await request(adminB.jar, `/admin/workouts/${gymPlanId}`)).status === 404)
  await callFormAction(adminB.jar, "/admin/workouts", updatePlan, { name: "Cross-gym rename" }, [gymPlanId])
  check("another gym's admin cannot rename it", (await WorkoutPlan.findOne({ gymId: gymAId, _id: gymPlanId }).lean())?.name === "E2E PPL")

  const gymSnapshot = async () =>
    JSON.stringify({
      plan: (await WorkoutPlan.findOne({ gymId: gymAId, _id: gymPlanId }).lean())?.name,
      days: (await WorkoutPlanDay.find({ gymId: gymAId, workoutPlanId: gymPlanId }).lean()).map((d) => d.name),
      items: (await WorkoutPlanExercise.find({ gymId: gymAId, workoutPlanId: gymPlanId }).lean()).map((i) => [i.sets, i.repsMin, i.targetWeight]),
    })
  const before = await gymSnapshot()

  // Assignment: forged member id from another gym, then the real one.
  await callFormAction(adminA.jar, `/admin/members/${a1}`, assign, { workoutPlanId: gymPlanId, startDate: DAY }, [b1])
  check("admin cannot assign to another gym's member", (await WorkoutPlanAssignment.countDocuments({ gymId: gymAId, userId: b1 })) + (await WorkoutPlanAssignment.countDocuments({ gymId: gymBId, userId: b1 })) === 0)
  await callFormAction(adminB.jar, `/admin/members/${b1}`, assign, { workoutPlanId: gymPlanId, startDate: DAY }, [b1])
  check("another gym's admin cannot assign this gym's plan", (await WorkoutPlanAssignment.countDocuments({ gymId: gymBId })) === 0)
  await callFormAction(adminA.jar, `/admin/members/${a1}`, assign, { workoutPlanId: gymPlanId, startDate: "" }, [a1])
  check("assignment without an explicit date is rejected (no server 'today')", (await WorkoutPlanAssignment.countDocuments({ gymId: gymAId, userId: a1 })) === 0)
  await callFormAction(adminA.jar, `/admin/members/${a1}`, assign, { workoutPlanId: gymPlanId, startDate: DAY, memberId: a2, assignedBy: a2 }, [a1])
  const assignment = await WorkoutPlanAssignment.findOne({ gymId: gymAId, userId: a1 }).lean()
  check("admin assigns the gym plan (forged memberId/assignedBy ignored)", Boolean(assignment) && assignment!.assignedBy.toString() !== a2 && (await WorkoutPlanAssignment.countDocuments({ gymId: gymAId, userId: a2 })) === 0)
  const second = await callFormAction(adminA.jar, `/admin/members/${a1}`, assign, { workoutPlanId: gymPlanId, startDate: "2026-10-02" }, [a1])
  check("a second active assignment is refused without confirmation", second.body.includes("ACTIVE_WORKOUT_ASSIGNMENT_EXISTS") && (await WorkoutPlanAssignment.countDocuments({ gymId: gymAId, userId: a1, status: "ACTIVE" })) === 1)

  // Member pages.
  const day = await request(memberA1.jar, `/workouts?date=${DAY}`)
  check("member sees the assigned plan", day.status === 200 && day.body.includes("E2E PPL") && day.body.includes("Start workout"))
  const other = await request(memberA2.jar, `/workouts?date=${DAY}`)
  check("a member without a plan sees none of it", other.status === 200 && !other.body.includes("E2E PPL"))
  check("the page without ?date renders the browser-redirect shell (no server 'today')", (await request(memberA1.jar, "/workouts")).status === 200)
  check("member gets 404 for the gym plan in the member builder", (await request(memberA1.jar, `/workouts/plans/${gymPlanId}`)).status === 404)

  // Member cannot reach the gym plan through the builder actions (forged bound ids),
  // called from a page that really hosts those actions: their own plan's builder.
  await callFormAction(memberA1.jar, "/workouts/plans", createPlan, { name: "E2E A1 Plan" })
  const a1Plan = (await WorkoutPlan.findOne({ gymId: gymAId, name: "E2E A1 Plan" }).lean())!._id.toString()
  const a1PlanPage = `/workouts/plans/${a1Plan}`
  await callFormAction(memberA1.jar, a1PlanPage, addDay, { name: "Mine" }, [a1Plan])
  check("member builder actions work on their own plan (200 page, day added)", (await request(memberA1.jar, a1PlanPage)).status === 200 && (await WorkoutPlanDay.countDocuments({ gymId: gymAId, workoutPlanId: a1Plan })) === 1)
  await callFormAction(memberA1.jar, a1PlanPage, addDay, { name: "Injected" }, [gymPlanId])
  await callFormAction(memberA1.jar, a1PlanPage, updatePlan, { name: "Hijacked" }, [gymPlanId])
  await callFormAction(memberA1.jar, a1PlanPage, updatePlanned, { sets: "9", repsMin: "1" }, [gymPlanId, planned!._id.toString()])
  check("member cannot modify the gym's shared plan via builder actions", (await gymSnapshot()) === before)

  // Member's own plan; admin read-only.
  await callFormAction(memberA2.jar, "/workouts/plans", createPlan, { name: "E2E A2 Plan", ownerUserId: a1 })
  const a2Plan = await WorkoutPlan.findOne({ gymId: gymAId, name: "E2E A2 Plan" }).lean()
  check("member creates their own plan (owner = themselves)", a2Plan?.ownerUserId?.toString() === a2 && a2Plan.createdBy.toString() === a2)
  check("another member gets 404 for it", (await request(memberA1.jar, `/workouts/plans/${a2Plan!._id}`)).status === 404)
  check("admin can view it read-only", (await request(adminA.jar, `/admin/workouts/${a2Plan!._id}`)).status === 200)
  await callFormAction(adminA.jar, "/admin/workouts", updatePlan, { name: "Admin rename" }, [a2Plan!._id.toString()])
  check("admin cannot edit a member's personal plan", (await WorkoutPlan.findOne({ gymId: gymAId, _id: a2Plan!._id }).lean())?.name === "E2E A2 Plan")
  check("admin's gym library excludes personal plans", !(await request(adminA.jar, "/admin/workouts")).body.includes("E2E A2 Plan"))
  await callFormAction(memberA1.jar, a1PlanPage, useMyPlan, { startDate: DAY }, [a2Plan!._id.toString()])
  check("a member cannot activate someone else's plan", (await WorkoutPlanAssignment.countDocuments({ gymId: gymAId, userId: a1, workoutPlanId: a2Plan!._id })) === 0)

  // A2 gets a real plan and workout of their own, so forged calls originate from a page hosting those actions.
  const a2Page = `/workouts/plans/${a2Plan!._id}`
  await callFormAction(memberA2.jar, a2Page, addDay, { name: "A2 day" }, [a2Plan!._id.toString()])
  const a2Day = (await WorkoutPlanDay.findOne({ gymId: gymAId, workoutPlanId: a2Plan!._id }).lean())!
  await callFormAction(memberA2.jar, a2Page, addPlanned, { exerciseId: bench!._id.toString(), sets: "2", repsMin: "10" }, [a2Plan!._id.toString(), a2Day._id.toString()])
  await callFormAction(memberA2.jar, a2Page, useMyPlan, { startDate: DAY }, [a2Plan!._id.toString()])
  const a2Started = await jsonAction(memberA2.jar, `/workouts?date=${DAY}`, start, [DAY, a2Day._id.toString()])
  const a2Session = await WorkoutSession.findOne({ gymId: gymAId, userId: a2 }).lean()
  check("member can start a workout from their own plan", ok(a2Started) && a2Session?.status === "IN_PROGRESS")
  const a2SessionPage = `/workouts/session/${a2Session!._id}`
  check("their own session page is 200", (await request(memberA2.jar, a2SessionPage)).status === 200)

  // Actual workout on the gym plan (before customizing): A1 logs sets.
  const started = await jsonAction(memberA1.jar, `/workouts?date=${DAY}`, start, [DAY, pushDay._id.toString()])
  const session = await WorkoutSession.findOne({ gymId: gymAId, userId: a1 }).lean()
  check("member starts a workout (date as supplied)", ok(started) && session?.date === DAY && session.status === "IN_PROGRESS")
  const sessionId = session!._id.toString()
  const sets = await SetLog.find({ gymId: gymAId, workoutSessionId: sessionId }).sort({ setNumber: 1 }).lean()
  check("planned sets are created empty (no values copied from the plan)", sets.length === 4 && sets.every((s) => s.weight === null && s.reps === null && !s.completed))
  const logged = await jsonAction(memberA1.jar, `/workouts/session/${sessionId}`, updateSet, [sessionId, sets[0]._id.toString(), { weight: "85", reps: "6", weightUnit: "kg", completed: true }])
  const set0 = await SetLog.findOne({ gymId: gymAId, _id: sets[0]._id }).lean()
  check("member logs actual 85 × 6 against a planned 80 × 6–8", ok(logged) && set0?.weight === 85 && set0.reps === 6 && set0.completed)
  check("the plan is unchanged by what was logged", (await gymSnapshot()) === before)

  // Other members / gyms / admins vs this session.
  check("member page for the session is 200 for the owner", (await request(memberA1.jar, `/workouts/session/${sessionId}`)).status === 200)
  check("another member gets 404 for the session", (await request(memberA2.jar, `/workouts/session/${sessionId}`)).status === 404)
  check("another gym's member gets 404 for the session", (await request(memberB1.jar, `/workouts/session/${sessionId}`)).status === 404)
  await jsonAction(memberA2.jar, a2SessionPage, updateSet, [sessionId, sets[1]._id.toString(), { weight: "1", reps: "1", completed: true }])
  await jsonAction(memberA2.jar, a2SessionPage, addSet, [sessionId, (await ExerciseSession.findOne({ gymId: gymAId, workoutSessionId: sessionId }).lean())!._id.toString(), { reps: "5" }])
  await jsonAction(memberA2.jar, a2SessionPage, finish, [sessionId])
  const stillOpen = await WorkoutSession.findOne({ gymId: gymAId, _id: sessionId }).lean()
  check(
    "another member cannot modify, extend or finish someone else's workout",
    (await SetLog.findOne({ gymId: gymAId, _id: sets[1]._id }).lean())?.completed === false &&
      (await SetLog.countDocuments({ gymId: gymAId, workoutSessionId: sessionId })) === 4 && stillOpen?.status === "IN_PROGRESS"
  )
  check("the member's admin can view the member page; another gym's admin gets 404", (await request(adminA.jar, `/admin/members/${a1}`)).status === 200 && (await request(adminB.jar, `/admin/members/${a1}`)).status === 404)

  const done = await jsonAction(memberA1.jar, `/workouts/session/${sessionId}`, finish, [sessionId])
  const finished = await WorkoutSession.findOne({ gymId: gymAId, _id: sessionId }).lean()
  check("owner finishes the workout (real timestamps, calendar day kept)", ok(done) && finished?.status === "COMPLETED" && finished.date === DAY && Boolean(finished.completedAt))
  const afterFinish = await jsonAction(memberA1.jar, `/workouts/session/${sessionId}`, updateSet, [sessionId, sets[0]._id.toString(), { weight: "999", reps: "1", completed: true }])
  check("a finished workout can't be edited", !ok(afterFinish) && (await SetLog.findOne({ gymId: gymAId, _id: sets[0]._id }).lean())?.weight === 85)
  const history = await request(memberA1.jar, "/workouts/history")
  check("history shows the workout and the performed set", history.status === 200 && history.body.includes("Push") && history.body.includes("85 kg"))
  check("another member's history shows none of it", !(await request(memberA2.jar, "/workouts/history")).body.includes("85 kg"))

  // Customize.
  const res = await jsonAction(memberA1.jar, `/workouts?date=${DAY}`, customize, ["2026-10-03"])
  const copy = await WorkoutPlan.findOne({ gymId: gymAId, ownerUserId: a1, sourcePlanId: gymPlanId }).lean()
  const active = await WorkoutPlanAssignment.findOne({ gymId: gymAId, userId: a1, status: "ACTIVE" }).lean()
  check("customize copies the gym plan for this member and switches to it", ok(res) && Boolean(copy) && active?.workoutPlanId.toString() === copy!._id.toString() && active.assignedBy.toString() === a1)
  check("copy has new day and exercise records", (await WorkoutPlanDay.countDocuments({ gymId: gymAId, workoutPlanId: copy!._id })) === 1 && !(await WorkoutPlanDay.exists({ gymId: gymAId, workoutPlanId: copy!._id, _id: pushDay._id })))
  check("the gym plan is unchanged after customizing", (await gymSnapshot()) === before)
  const again = await jsonAction(memberA1.jar, `/workouts?date=${DAY}`, customize, ["2026-10-04"])
  check("customizing again does not create another copy", ok(again) && (await WorkoutPlan.countDocuments({ gymId: gymAId, ownerUserId: a1, sourcePlanId: gymPlanId })) === 1)
  check("history still shows the workout done on the gym plan", (await request(memberA1.jar, "/workouts/history")).body.includes("E2E PPL"))
  check("member opens their copy in the builder (200)", (await request(memberA1.jar, `/workouts/plans/${copy!._id}`)).status === 200)
  const nonDate = await jsonAction(memberA1.jar, "/workouts", customize, ["not-a-date"])
  check("customize with an invalid date is rejected", !ok(nonDate))
}

// ---------------------------------------------------------------- performance (Module 5)

async function runPerformance() {
  console.log("\n── Performance (Module 5)")
  const idOf = async (email: string) => (await crossTenant(User.findOne({ email })).lean())!._id.toString()
  const a1 = await idOf(gymA.members[0].email)
  const a2 = await idOf(gymA.members[1].email)
  const b1 = await idOf(gymB.members[0].email)
  const gymAId = (await crossTenant(User.findOne({ email: gymA.admin.email })).lean())!.gymId!.toString()
  const adminA = await login(gymA.admin.email)
  const adminB = await login(gymB.admin.email)
  const memberA1 = await login(gymA.members[0].email)
  const memberA2 = await login(gymA.members[1].email)
  const memberB1 = await login(gymB.members[0].email)
  const denied = (r: { status: number; location: string }) => r.status === 403 || redirectsTo(r, "/forbidden") || r.status === 404

  const bench = (await Exercise.findOne({ gymId: gymAId, name: "E2E Bench" }).lean())!._id.toString()
  const act = (file: string, name: string) => actionId(`src/server/actions/${file}.ts`, name)
  const apply = act("performance-actions", "applySuggestedTargetAction")
  const progressPath = `/workouts/progress?exercise=${bench}`

  // Routes.
  check("anonymous is sent to login for /workouts/progress", redirectsTo(await request(new Map(), "/workouts/progress"), "/login"))
  check("gym admin cannot open the member progress page", denied(await request(adminA.jar, "/workouts/progress")))
  check("member cannot open an admin member-progress page", denied(await request(memberA1.jar, `/admin/members/${a1}/progress`)))

  // A1 has a completed workout (85 kg × 6 on the gym plan's bench); A2 only has one in progress; B1 nothing.
  const mine = await request(memberA1.jar, progressPath)
  check(
    "member sees their own progress, records and the estimated-1RM disclaimer",
    mine.status === 200 && mine.body.includes("E2E Bench") && mine.body.includes("Personal records") && mine.body.includes("Estimated 1RM") && mine.body.includes("not a tested one-rep max")
  )
  check("a single session says to complete more to compare", mine.body.includes("Complete more sessions to compare your progress."))
  const a2Page = await request(memberA2.jar, progressPath)
  check("another member sees none of it (in-progress workouts don't count)", a2Page.status === 200 && !a2Page.body.includes("Personal records") && a2Page.body.includes("No completed workouts yet."))
  const b1Page = await request(memberB1.jar, progressPath)
  check("another gym's member gets an empty state for the same exercise id", b1Page.status === 200 && !b1Page.body.includes("Personal records") && b1Page.body.includes("No completed workouts yet."))
  const forged = await request(memberA1.jar, "/workouts/progress?exercise=zzz&from=nope&to=nope&memberId=" + a2 + "&userId=" + a2 + "&gymId=x")
  check("forged/invalid query values are ignored (still my own data)", forged.status === 200 && forged.body.includes("E2E Bench"))

  // Admin: own gym's members only.
  const adminView = await request(adminA.jar, `/admin/members/${a1}/progress?exercise=${bench}`)
  check("admin sees their member's progress read-only (no apply button)", adminView.status === 200 && adminView.body.includes("Personal records") && !adminView.body.includes("Update my plan"))
  check("another gym's admin gets 404 for the member", (await request(adminB.jar, `/admin/members/${a1}/progress`)).status === 404)
  check("admin gets 404 for another gym's member", (await request(adminA.jar, `/admin/members/${b1}/progress`)).status === 404)

  // History and the finished-session page.
  const session = await WorkoutSession.findOne({ gymId: gymAId, userId: a1, status: "COMPLETED" }).lean()
  const sessionPage = await request(memberA1.jar, `/workouts/session/${session!._id}`)
  check("a finished workout shows how it compares", sessionPage.status === 200 && sessionPage.body.includes("How this workout compares"))
  const historyText = (await request(memberA1.jar, "/workouts/history")).body.replace(/<!-- -->/g, "")
  check("history shows planned vs actual from the workout's own snapshot", historyText.includes("Planned 80 kg") && historyText.includes("actual") && historyText.includes("+5 kg"))

  // The plan never changes by itself; the apply action is explicit and ownership-checked.
  const gymItem = (await WorkoutPlanExercise.findOne({ gymId: gymAId, workoutPlanId: (await WorkoutPlan.findOne({ gymId: gymAId, name: "E2E PPL" }).lean())!._id }).lean())!
  const copyPlan = (await WorkoutPlan.findOne({ gymId: gymAId, ownerUserId: a1, sourcePlanId: gymItem.workoutPlanId }).lean())!
  const copyItem = (await WorkoutPlanExercise.findOne({ gymId: gymAId, workoutPlanId: copyPlan._id }).lean())!
  const itemSnapshot = async () => JSON.stringify((await WorkoutPlanExercise.find({ gymId: gymAId }).sort({ _id: 1 }).lean()).map((i) => [i._id, i.targetWeight, i.sets]))
  const before = await itemSnapshot()
  await request(memberA1.jar, progressPath)
  await request(memberA1.jar, "/workouts/history")
  check("viewing progress/history never modifies any plan", (await itemSnapshot()) === before)

  await jsonAction(memberA1.jar, progressPath, apply, [gymItem._id.toString(), 87.5, "kg"])
  check("a member cannot change the shared gym plan's target", (await WorkoutPlanExercise.findOne({ gymId: gymAId, _id: gymItem._id }).lean())?.targetWeight === gymItem.targetWeight)
  await jsonAction(memberA2.jar, progressPath, apply, [copyItem._id.toString(), 1, "kg"])
  check("another member cannot change my personal plan's target", (await WorkoutPlanExercise.findOne({ gymId: gymAId, _id: copyItem._id }).lean())?.targetWeight === copyItem.targetWeight)
  await jsonAction(adminA.jar, `/admin/members/${a1}/progress`, apply, [copyItem._id.toString(), 2, "kg"])
  check("a gym admin cannot use the member action to change a personal plan", (await WorkoutPlanExercise.findOne({ gymId: gymAId, _id: copyItem._id }).lean())?.targetWeight === copyItem.targetWeight)
  const own = await jsonAction(memberA1.jar, progressPath, apply, [copyItem._id.toString(), 87.5, "kg"])
  const updated = await WorkoutPlanExercise.findOne({ gymId: gymAId, _id: copyItem._id }).lean()
  check("the member explicitly updates their own plan's target", ok(own) && updated?.targetWeight === 87.5 && updated.sets === copyItem.sets)
  check("their finished workout's snapshot is unchanged", (await ExerciseSession.findOne({ gymId: gymAId, workoutSessionId: session!._id, exerciseId: bench }).lean())?.planned.targetWeight === 80)
  const bad = await jsonAction(memberA1.jar, progressPath, apply, [copyItem._id.toString(), -5, "kg"])
  check("an invalid target is rejected", !ok(bad) && (await WorkoutPlanExercise.findOne({ gymId: gymAId, _id: copyItem._id }).lean())?.targetWeight === 87.5)
}

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
    await runNutrition()
    await runPersonalPlans()
    await runWorkouts()
    await runPerformance()
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
