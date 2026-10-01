/**
 * Module 3B service additions: the plan that applies on a given day, and
 * ACTUAL consumption logging (snapshots), with ownership and date integrity.
 * Runs against a throwaway in-memory MongoDB replica set.
 */
import assert from "node:assert/strict"
import { after, before, describe, mock, test } from "node:test"

import { MongoMemoryReplSet } from "mongodb-memory-server"

import { loadSessionUser } from "@/server/auth/account"
import { ForbiddenError } from "@/server/auth/guards"
import { disconnectFromDatabase } from "@/server/db/connect"
import { crossTenant } from "@/server/db/tenant-guard"
import { DomainError, ValidationError } from "@/server/errors"
import { DailyNutritionLog } from "@/server/models/daily-nutrition-log"
import { DietPlanMealFood } from "@/server/models/diet-plan-meal-food"
import { User } from "@/server/models/user"
import { assignDietPlan, endDietPlanAssignment, getDietPlanForDate } from "@/server/services/nutrition/assignment-service"
import {
  getDailyNutritionLog,
  logConsumption,
  removeConsumedEntry,
  updateConsumedEntry,
} from "@/server/services/nutrition/daily-log-service"
import { addDietPlanMeal, addDietPlanMealFood, createDietPlan } from "@/server/services/nutrition/diet-plan-service"
import { createFood, setFoodArchived, updateFood } from "@/server/services/nutrition/food-service"
import { gymMemberTarget, platformMemberTarget, selfTarget } from "@/server/services/nutrition/member-target"
import type { GymAdminUser, MemberUser, SessionUser, SuperAdminUser } from "@/types/auth"

import { devAccounts, seedDevelopmentData } from "../scripts/lib/seed-data"

const [gymA, gymB] = devAccounts.gyms
let replSet: MongoMemoryReplSet
let superAdmin: SuperAdminUser
let adminA: GymAdminUser
let adminB: GymAdminUser
let memberA1: MemberUser
let memberA2: MemberUser
let memberB1: MemberUser

async function contextFor(email: string): Promise<SessionUser> {
  const user = await crossTenant(User.findOne({ email })).lean()
  assert.ok(user)
  const result = await loadSessionUser(user._id.toString())
  assert.ok(result.ok)
  return result.user
}
const isCode = (code: DomainError["code"]) => (e: unknown) => e instanceof DomainError && e.code === code
const isValidation = (field?: string) => (e: unknown) =>
  e instanceof ValidationError && (!field || Boolean(e.fieldErrors[field]?.length))

// Spec example: eggs at 70 kcal / 6 g protein per piece.
const eggsInput = { name: "Eggs", servingSize: 1, servingUnit: "piece", calories: 70, protein: 6 } as const
let eggs: string
let rice: string
let banana: string
let foodB: string
let plan: string
let breakfast: string
let lunch: string

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ launchTimeout: 60_000 }],
  })
  process.env.MONGODB_URI = replSet.getUri("fittrack-logging-test")
  await seedDevelopmentData("test-password-123")
  superAdmin = (await contextFor(devAccounts.superAdmin.email)) as SuperAdminUser
  adminA = (await contextFor(gymA.admin.email)) as GymAdminUser
  adminB = (await contextFor(gymB.admin.email)) as GymAdminUser
  memberA1 = (await contextFor(gymA.members[0].email)) as MemberUser
  memberA2 = (await contextFor(gymA.members[1].email)) as MemberUser
  memberB1 = (await contextFor(gymB.members[0].email)) as MemberUser

  eggs = (await createFood(adminA, eggsInput)).id
  rice = (await createFood(adminA, { name: "Rice", servingSize: 100, servingUnit: "g", calories: 130, protein: 2.7 })).id
  banana = (await createFood(adminA, { name: "Banana", servingSize: 1, servingUnit: "piece", calories: 105, protein: 1.3 })).id
  foodB = (await createFood(adminB, { name: "B food", servingSize: 1, servingUnit: "piece", calories: 50, protein: 1 })).id

  plan = (await createDietPlan(adminA, { name: "Muscle Gain Plan" })).id
  breakfast = (await addDietPlanMeal(adminA, plan, { name: "Breakfast", time: "08:00" })).id
  lunch = (await addDietPlanMeal(adminA, plan, { name: "Lunch", time: "13:30" })).id
  await addDietPlanMealFood(adminA, breakfast, { foodId: eggs, quantity: 4, unit: "piece" })
  await addDietPlanMealFood(adminA, lunch, { foodId: rice, quantity: 200, unit: "g" })
  await assignDietPlan(adminA, { dietPlanId: plan, memberId: memberA1.id, startDate: "2026-10-01", endDate: "2026-10-31" })
})

after(async () => {
  await disconnectFromDatabase()
  await replSet?.stop()
})

describe("plan for a given day", () => {
  test("covers exactly [startDate, endDate] in the supplied calendar day", async () => {
    const me = selfTarget(memberA1)
    assert.equal(await getDietPlanForDate(me, "2026-09-30"), null, "before start")
    assert.equal((await getDietPlanForDate(me, "2026-10-01"))?.plan.name, "Muscle Gain Plan")
    assert.equal((await getDietPlanForDate(me, "2026-10-31"))?.plan.name, "Muscle Gain Plan")
    assert.equal(await getDietPlanForDate(me, "2026-11-01"), null, "after end")
    assert.equal(await getDietPlanForDate(selfTarget(memberA2), "2026-10-15"), null, "other member has none")
    await assert.rejects(getDietPlanForDate(me, "15/10/2026"), isValidation())
  })

  test("past days keep the plan that applied; the newer plan wins on hand-over day", async () => {
    const p1 = (await createDietPlan(adminA, { name: "Old plan" })).id
    const p2 = (await createDietPlan(adminA, { name: "New plan" })).id
    await assignDietPlan(adminA, { dietPlanId: p1, memberId: memberA2.id, startDate: "2026-09-01" })
    await assignDietPlan(adminA, { dietPlanId: p2, memberId: memberA2.id, startDate: "2026-09-15", replaceActive: true })
    const a2 = selfTarget(memberA2)
    assert.equal((await getDietPlanForDate(a2, "2026-09-10"))?.plan.name, "Old plan")
    assert.equal((await getDietPlanForDate(a2, "2026-09-10"))?.assignment.status, "COMPLETED")
    assert.equal((await getDietPlanForDate(a2, "2026-09-15"))?.plan.name, "New plan")
    assert.equal((await getDietPlanForDate(a2, "2026-12-01"))?.plan.name, "New plan", "open-ended")
  })
})

describe("actual consumption logging", () => {
  let eggEntry: string

  test("planned ≠ consumed: logging records exactly what was eaten, as a snapshot", async () => {
    const me = selfTarget(memberA1)
    // Nothing is consumed just because a plan exists.
    assert.equal(await getDailyNutritionLog(me, "2026-10-01"), null)

    // Planned 4 eggs, actually ate 3.
    const log = await logConsumption(me, "2026-10-01", {
      dietPlanMealId: breakfast,
      items: [{ foodId: eggs, quantity: "3", unit: "piece" }],
    })
    assert.equal(log.entries.length, 1)
    eggEntry = log.entries[0].id
    assert.deepEqual(
      [log.entries[0].name, log.entries[0].quantity, log.entries[0].calories, log.entries[0].protein],
      ["Eggs", 3, 210, 18]
    )
    assert.equal(log.entries[0].dietPlanMealId, breakfast, "linked to the planned meal (drives the checklist)")
    assert.deepEqual(log.totals, { calories: 210, protein: 18, carbs: null, fat: null })

    // The plan itself is untouched (still 4 eggs).
    const planned = (await getDietPlanForDate(me, "2026-10-01"))!.plan.meals.find((m) => m.id === breakfast)!
    assert.equal(planned.foods[0].quantity, 4)
  })

  test("food outside the plan can be logged from the gym library", async () => {
    const log = await logConsumption(selfTarget(memberA1), "2026-10-01", {
      items: [
        { foodId: banana, quantity: 1, unit: "piece" },
        { foodId: rice, quantity: 1.5, unit: "serving" },
      ],
    })
    assert.equal(log.entries.length, 3)
    assert.equal(log.entries[1].dietPlanMealId, null)
    assert.equal(log.totals.calories, 210 + 105 + 195)
  })

  test("history keeps logging-time values after the Food is edited", async () => {
    await updateFood(adminA, eggs, { ...eggsInput, calories: 80, protein: 7 })
    const me = selfTarget(memberA1)
    const old = (await getDailyNutritionLog(me, "2026-10-01"))!.entries.find((e) => e.id === eggEntry)!
    assert.deepEqual([old.calories, old.protein], [210, 18], "old log unchanged")

    // Changing the logged quantity rescales from the snapshot, not the new food values.
    const edited = await updateConsumedEntry(me, "2026-10-01", eggEntry, { quantity: 2 })
    const entry = edited.entries.find((e) => e.id === eggEntry)!
    assert.deepEqual([entry.quantity, entry.calories, entry.protein], [2, 140, 12])

    // A new log uses the new values.
    const next = await logConsumption(me, "2026-10-02", { items: [{ foodId: eggs, quantity: 3, unit: "piece" }] })
    assert.deepEqual([next.entries[0].calories, next.entries[0].protein], [240, 21])
  })

  test("removing an entry updates the day's totals", async () => {
    const me = selfTarget(memberA1)
    const before = (await getDailyNutritionLog(me, "2026-10-02"))!
    const after = await removeConsumedEntry(me, "2026-10-02", before.entries[0].id)
    assert.equal(after.entries.length, 0)
    assert.deepEqual(after.totals, { calories: 0, protein: 0, carbs: null, fat: null })
    await assert.rejects(removeConsumedEntry(me, "2026-10-02", before.entries[0].id), isCode("NOT_FOUND"))
  })

  test("archived foods: blocked off-plan, still loggable for a planned meal containing them", async () => {
    const me = selfTarget(memberA1)
    await setFoodArchived(adminA, rice, true)
    await assert.rejects(
      logConsumption(me, "2026-10-03", { items: [{ foodId: rice, quantity: 100, unit: "g" }] }),
      isCode("FOOD_ARCHIVED")
    )
    const log = await logConsumption(me, "2026-10-03", {
      dietPlanMealId: lunch,
      items: [{ foodId: rice, quantity: 200, unit: "g" }],
    })
    assert.equal(log.entries[0].calories, 260)
    await setFoodArchived(adminA, rice, false)
  })

  test("invalid input is rejected", async () => {
    const me = selfTarget(memberA1)
    const day = "2026-10-04"
    await assert.rejects(logConsumption(me, day, { items: [{ foodId: eggs, quantity: -1, unit: "piece" }] }), isValidation("items.0.quantity"))
    await assert.rejects(logConsumption(me, day, { items: [{ foodId: eggs, quantity: 0, unit: "piece" }] }), isValidation())
    await assert.rejects(logConsumption(me, day, { items: [] }), isValidation("items"))
    await assert.rejects(logConsumption(me, day, { items: [{ foodId: "bad", quantity: 1, unit: "piece" }] }), isValidation())
    await assert.rejects(logConsumption(me, day, { items: [{ foodId: eggs, quantity: 1, unit: "g" }] }), isCode("UNIT_MISMATCH"))
    await assert.rejects(updateConsumedEntry(me, "2026-10-01", eggEntry, { quantity: -2 }), isValidation("quantity"))
    await assert.rejects(logConsumption(me, "2026-02-30", { items: [{ foodId: eggs, quantity: 1, unit: "piece" }] }), isValidation())
    assert.equal(await getDailyNutritionLog(me, day), null, "nothing written")
  })
})

describe("ownership and tenant isolation", () => {
  test("a member can't touch another member's entries or link another plan's meal", async () => {
    const a1Log = (await getDailyNutritionLog(selfTarget(memberA1), "2026-10-01"))!
    const a2 = selfTarget(memberA2)
    await assert.rejects(updateConsumedEntry(a2, "2026-10-01", a1Log.entries[0].id, { quantity: 9 }), isCode("NOT_FOUND"))
    await assert.rejects(removeConsumedEntry(a2, "2026-10-01", a1Log.entries[0].id), isCode("NOT_FOUND"))
    assert.equal(await getDailyNutritionLog(a2, "2026-10-01"), null)
    // A2's plan doesn't contain A1's breakfast meal.
    await assert.rejects(
      logConsumption(a2, "2026-10-01", { dietPlanMealId: breakfast, items: [{ foodId: eggs, quantity: 1, unit: "piece" }] }),
      isCode("NOT_FOUND")
    )
    // A1's plan doesn't apply on 2026-11-05, so linking its meal that day fails too.
    await assert.rejects(
      logConsumption(selfTarget(memberA1), "2026-11-05", { dietPlanMealId: breakfast, items: [{ foodId: eggs, quantity: 1, unit: "piece" }] }),
      isCode("NOT_FOUND")
    )
  })

  test("forged userId/gymId in the payload are ignored", async () => {
    const log = await logConsumption(selfTarget(memberA2), "2026-10-05", {
      items: [{ foodId: banana, quantity: 1, unit: "piece" }],
      userId: memberA1.id,
      gymId: adminB.gymId,
    } as never)
    const stored = await DailyNutritionLog.findOne({ gymId: adminA.gymId, _id: log.id }).lean()
    assert.equal(stored?.userId.toString(), memberA2.id)
    assert.equal(stored?.gymId.toString(), adminA.gymId)
  })

  test("another gym's foods can't be logged", async () => {
    await assert.rejects(
      logConsumption(selfTarget(memberA1), "2026-10-06", { items: [{ foodId: foodB, quantity: 1, unit: "piece" }] }),
      isCode("NOT_FOUND")
    )
    await assert.rejects(
      logConsumption(selfTarget(memberB1), "2026-10-06", { items: [{ foodId: eggs, quantity: 1, unit: "piece" }] }),
      isCode("NOT_FOUND")
    )
  })

  test("admins read their own members' logs only; super admin is read-only", async () => {
    assert.ok(await getDailyNutritionLog(await gymMemberTarget(adminA, memberA1.id), "2026-10-01"))
    await assert.rejects(gymMemberTarget(adminB, memberA1.id), isCode("NOT_FOUND"))
    const platform = await platformMemberTarget(superAdmin, memberA1.id)
    assert.ok(await getDailyNutritionLog(platform, "2026-10-01"))
    await assert.rejects(
      logConsumption(platform, "2026-10-01", { items: [{ foodId: eggs, quantity: 1, unit: "piece" }] }),
      ForbiddenError
    )
  })

  test("members have no way to change admin-owned diet structures", async () => {
    // Members may edit plans — but only their OWN personal plans. A gym plan
    // is invisible to a member's scope, so any change to it is "not found".
    await assert.rejects(addDietPlanMeal(memberA1, plan, { name: "X", time: "10:00" }), isCode("NOT_FOUND"))
    // Food library and assignment management stay admin-only.
    await assert.rejects(createFood(memberA1 as unknown as GymAdminUser, eggsInput), ForbiddenError)
    await assert.rejects(
      endDietPlanAssignment(memberA1 as unknown as GymAdminUser, plan, { status: "CANCELLED", endDate: "2026-10-01" }),
      ForbiddenError
    )
    assert.equal(await DietPlanMealFood.countDocuments({ gymId: adminA.gymId, dietPlanId: plan }), 2)
  })
})

describe("date integrity for logging", () => {
  test("entries are stored under the supplied local day, not the server's UTC day", async () => {
    // Server clock: 2026-10-07T20:30Z — already 2026-10-08 for a member in India.
    mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-07T20:30:00Z") })
    try {
      const me = selfTarget(memberA1)
      const log = await logConsumption(me, "2026-10-08", { items: [{ foodId: banana, quantity: 1, unit: "piece" }] })
      assert.equal(log.date, "2026-10-08")
      assert.equal(await getDailyNutritionLog(me, "2026-10-07"), null, "nothing filed under the server's UTC day")
      assert.equal((await getDietPlanForDate(me, "2026-10-08"))?.plan.name, "Muscle Gain Plan")
    } finally {
      mock.timers.reset()
    }
  })
})
