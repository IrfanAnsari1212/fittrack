/**
 * Module 3A — nutrition data layer: ownership, tenant isolation, validation
 * and calculations. Runs against a throwaway in-memory MongoDB replica set.
 *
 *   npm test
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import { MongoMemoryReplSet } from "mongodb-memory-server"

import { nutritionFor, servingsFor, snapshotConsumption, sumNutrition, UnitMismatchError } from "@/lib/nutrition/calculations"
import { addDays, isCalendarDate } from "@/lib/nutrition/calendar-date"
import { loadSessionUser } from "@/server/auth/account"
import { ForbiddenError } from "@/server/auth/guards"
import { disconnectFromDatabase } from "@/server/db/connect"
import { crossTenant, TenantScopeError } from "@/server/db/tenant-guard"
import { DomainError, ValidationError } from "@/server/errors"
import { DietPlan } from "@/server/models/diet-plan"
import { DietPlanAssignment } from "@/server/models/diet-plan-assignment"
import { DietPlanMealFood } from "@/server/models/diet-plan-meal-food"
import { Food } from "@/server/models/food"
import { NutritionGoal } from "@/server/models/nutrition-goal"
import { User } from "@/server/models/user"
import {
  assignDietPlan,
  endDietPlanAssignment,
  getActiveDietPlan,
  listDietPlanAssignments,
} from "@/server/services/nutrition/assignment-service"
import { getDailyNutritionLog, getOrCreateDailyNutritionLog } from "@/server/services/nutrition/daily-log-service"
import {
  addDietPlanMeal,
  addDietPlanMealFood,
  createDietPlan,
  deleteDietPlanMeal,
  getDietPlanDetail,
  listAllDietPlans,
  listDietPlans,
  removeDietPlanMealFood,
  reorderDietPlanMeals,
  setDietPlanArchived,
  updateDietPlan,
  updateDietPlanMeal,
  updateDietPlanMealFood,
} from "@/server/services/nutrition/diet-plan-service"
import { createFood, deleteFood, getFood, listFoods, setFoodArchived, updateFood } from "@/server/services/nutrition/food-service"
import {
  getCurrentNutritionGoal,
  listNutritionGoals,
  setNutritionGoal,
  updateNutritionGoal,
} from "@/server/services/nutrition/goal-service"
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
let memberB2: MemberUser

async function contextFor(email: string): Promise<SessionUser> {
  const user = await crossTenant(User.findOne({ email })).lean()
  assert.ok(user, `missing ${email}`)
  const result = await loadSessionUser(user._id.toString())
  assert.ok(result.ok)
  return result.user
}

const isCode = (code: DomainError["code"]) => (error: unknown) =>
  error instanceof DomainError && error.code === code
const isValidation = (field?: string) => (error: unknown) =>
  error instanceof ValidationError && (!field || Boolean(error.fieldErrors[field]?.length))

const egg = { name: "Egg", servingSize: 1, servingUnit: "piece", calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3 } as const
const rice = { name: "Rice (cooked)", servingSize: 100, servingUnit: "g", calories: 130, protein: 2.7, carbs: 28, fat: null } as const
const goal = { dailyCalories: 2400, dailyProtein: 170, effectiveFrom: "2026-02-01" }

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ launchTimeout: 60_000 }],
  })
  process.env.MONGODB_URI = replSet.getUri("fittrack-nutrition-test")
  await seedDevelopmentData("test-password-123")
  superAdmin = (await contextFor(devAccounts.superAdmin.email)) as SuperAdminUser
  adminA = (await contextFor(gymA.admin.email)) as GymAdminUser
  adminB = (await contextFor(gymB.admin.email)) as GymAdminUser
  memberA1 = (await contextFor(gymA.members[0].email)) as MemberUser
  memberA2 = (await contextFor(gymA.members[1].email)) as MemberUser
  memberB1 = (await contextFor(gymB.members[0].email)) as MemberUser
  memberB2 = (await contextFor(gymB.members[1].email)) as MemberUser
})

after(async () => {
  await disconnectFromDatabase()
  await replSet?.stop()
})

// ── Pure calculations ────────────────────────────────────────────────────

describe("calculations", () => {
  test("servings and nutrition follow quantity × per-serving values", () => {
    assert.equal(servingsFor(egg, 4, "piece"), 4)
    assert.equal(servingsFor(rice, 200, "g"), 2)
    assert.equal(servingsFor(rice, 1.5, "serving"), 1.5)
    assert.deepEqual(nutritionFor(egg, 4, "piece"), { calories: 312, protein: 25.2, carbs: 2.4, fat: 21.2 })
    assert.deepEqual(nutritionFor(rice, 200, "g"), { calories: 260, protein: 5.4, carbs: 56, fat: null })
  })

  test("incompatible units and negative quantities are rejected", () => {
    assert.throws(() => servingsFor(rice, 2, "piece"), UnitMismatchError)
    assert.throws(() => servingsFor(egg, -1, "piece"), RangeError)
    assert.throws(() => servingsFor(egg, Number.NaN, "piece"), RangeError)
  })

  test("sums keep optional macros null only when nothing defines them", () => {
    const total = sumNutrition([nutritionFor(egg, 4, "piece"), nutritionFor(rice, 200, "g")])
    assert.deepEqual(total, { calories: 572, protein: 30.6, carbs: 58.4, fat: 21.2 })
    assert.equal(sumNutrition([nutritionFor(rice, 100, "g")]).fat, null)
  })

  test("consumption snapshots carry the values at logging time", () => {
    const snap = snapshotConsumption(egg, 2, "piece")
    assert.deepEqual(snap, { name: "Egg", quantity: 2, unit: "piece", calories: 156, protein: 12.6, carbs: 1.2, fat: 10.6 })
  })

  test("calendar dates are validated and ordered as strings", () => {
    assert.ok(isCalendarDate("2026-02-28"))
    assert.equal(isCalendarDate("2026-02-30"), false)
    assert.equal(isCalendarDate("2026-2-3"), false)
    assert.equal(addDays("2026-12-31", 1), "2027-01-01")
    assert.ok("2026-10-09" < "2026-10-10")
  })
})

// ── Goals ────────────────────────────────────────────────────────────────

describe("nutrition goals", () => {
  test("1. member can create and update their own goal", async () => {
    const me = selfTarget(memberA1)
    const created = await setNutritionGoal(me, memberA1, { ...goal, effectiveFrom: "2026-01-01" })
    assert.equal(created.dailyCalories, 2400)
    assert.equal(created.dailyCarbs, null)

    // Same start date → updates that goal rather than duplicating it.
    await setNutritionGoal(me, memberA1, { dailyCalories: "2500", dailyProtein: "175", effectiveFrom: "2026-01-01" })
    const updated = await updateNutritionGoal(me, memberA1, created.id, { dailyCalories: 2600, dailyProtein: 180, dailyFat: 70 })
    assert.equal(updated.dailyCalories, 2600)
    assert.equal(updated.dailyFat, 70)
    assert.equal((await listNutritionGoals(me)).length, 1)

    const saved = await NutritionGoal.findOne({ gymId: adminA.gymId, _id: created.id }).lean()
    assert.equal(saved?.userId.toString(), memberA1.id)
    assert.equal(saved?.gymId.toString(), adminA.gymId)
  })

  test("the current goal is the latest one in effect", async () => {
    const me = selfTarget(memberA1)
    await setNutritionGoal(me, memberA1, { dailyCalories: 2200, dailyProtein: 160, effectiveFrom: "2026-06-01" })
    assert.equal((await getCurrentNutritionGoal(me, "2026-05-31"))?.dailyCalories, 2600)
    assert.equal((await getCurrentNutritionGoal(me, "2026-06-01"))?.dailyCalories, 2200)
    assert.equal(await getCurrentNutritionGoal(selfTarget(memberA2), "2026-06-01"), null)
  })

  test("2/11. a member cannot read or change another member's goal (client userId ignored)", async () => {
    const a1Goal = (await getCurrentNutritionGoal(selfTarget(memberA1), "2026-12-31"))!
    // A2 tries to update A1's goal id: scoped to A2 → not found.
    await assert.rejects(updateNutritionGoal(selfTarget(memberA2), memberA2, a1Goal.id, goal), isCode("NOT_FOUND"))
    // A forged userId/gymId in the payload is stripped by the schema.
    await setNutritionGoal(selfTarget(memberA2), memberA2, {
      ...goal,
      effectiveFrom: "2026-03-01",
      userId: memberA1.id,
      gymId: adminB.gymId,
    } as never)
    const a2Goals = await listNutritionGoals(selfTarget(memberA2))
    assert.equal(a2Goals.length, 1)
    const stored = await NutritionGoal.findOne({ gymId: adminA.gymId, _id: a2Goals[0].id }).lean()
    assert.equal(stored?.userId.toString(), memberA2.id)
    assert.equal(stored?.gymId.toString(), adminA.gymId)
    // A1 unchanged.
    assert.equal((await getCurrentNutritionGoal(selfTarget(memberA1), "2026-12-31"))?.dailyCalories, a1Goal.dailyCalories)
  })

  test("3. gym admin can manage goals of their own members", async () => {
    const target = await gymMemberTarget(adminA, memberA2.id)
    const set = await setNutritionGoal(target, adminA, { dailyCalories: 2000, dailyProtein: 150, effectiveFrom: "2026-04-01" })
    assert.equal(set.dailyCalories, 2000)
    const stored = await NutritionGoal.findOne({ gymId: adminA.gymId, _id: set.id }).lean()
    assert.equal(stored?.setBy.toString(), adminA.id, "audit records who set it")
  })

  test("4. gym admin cannot target another gym's member (or a non-member)", async () => {
    await assert.rejects(gymMemberTarget(adminA, memberB1.id), isCode("NOT_FOUND"))
    await assert.rejects(gymMemberTarget(adminB, memberA1.id), isCode("NOT_FOUND"))
    await assert.rejects(gymMemberTarget(adminA, adminA.id), isCode("NOT_FOUND"))
  })

  test("13. negative / missing nutrition values are rejected", async () => {
    const me = selfTarget(memberA1)
    await assert.rejects(setNutritionGoal(me, memberA1, { dailyCalories: -100, dailyProtein: 150, effectiveFrom: "2026-02-01" }), isValidation("dailyCalories"))
    await assert.rejects(setNutritionGoal(me, memberA1, { dailyCalories: 2000, dailyProtein: -1, effectiveFrom: "2026-02-01" }), isValidation("dailyProtein"))
    await assert.rejects(setNutritionGoal(me, memberA1, { dailyCalories: "", dailyProtein: 150, effectiveFrom: "2026-02-01" }), isValidation("dailyCalories"))
    await assert.rejects(setNutritionGoal(me, memberA1, { dailyCalories: "abc", dailyProtein: 150, effectiveFrom: "2026-02-01" }), isValidation("dailyCalories"))
    await assert.rejects(setNutritionGoal(me, memberA1, { ...goal, dailyFat: -5 }), isValidation("dailyFat"))
    await assert.rejects(setNutritionGoal(me, memberA1, { ...goal, effectiveFrom: "2026-13-01" }), isValidation("effectiveFrom"))
  })

  test("services reject the wrong role", () => {
    assert.throws(() => selfTarget(adminA as unknown as MemberUser), ForbiddenError)
  })
})

// ── Foods ────────────────────────────────────────────────────────────────

let eggA: string
let riceA: string
let eggB: string

describe("foods", () => {
  test("gym admin creates foods in their own gym; members can read them", async () => {
    eggA = (await createFood(adminA, egg)).id
    riceA = (await createFood(adminA, { ...rice, servingSize: "100", calories: "130", carbs: "", fat: "" })).id
    eggB = (await createFood(adminB, { ...egg, gymId: adminA.gymId } as never)).id // forged gymId ignored

    const stored = await Food.findOne({ gymId: adminB.gymId, _id: eggB }).lean()
    assert.ok(stored, "created in admin B's gym despite forged gymId")
    assert.equal(stored.carbs, 0.6)

    const memberView = await listFoods(memberA1)
    assert.deepEqual(memberView.map((f) => f.name).sort(), ["Egg", "Rice (cooked)"])
    assert.equal((await getFood(memberA1, riceA))?.carbs, null)
  })

  test("foods are isolated per gym", async () => {
    assert.equal(await getFood(adminA, eggB), null)
    assert.equal(await getFood(memberB1, eggA), null)
    await assert.rejects(updateFood(adminA, eggB, egg), isCode("NOT_FOUND"))
    await assert.rejects(setFoodArchived(adminA, eggB, true), isCode("NOT_FOUND"))
    await assert.rejects(deleteFood(adminA, eggB), isCode("NOT_FOUND"))
    assert.ok(!(await listFoods(adminB)).some((f) => f.id === eggA))
  })

  test("13. negative or zero serving/nutrition values are rejected", async () => {
    await assert.rejects(createFood(adminA, { ...egg, calories: -1 }), isValidation("calories"))
    await assert.rejects(createFood(adminA, { ...egg, protein: -0.5 }), isValidation("protein"))
    await assert.rejects(createFood(adminA, { ...egg, servingSize: 0 }), isValidation("servingSize"))
    await assert.rejects(createFood(adminA, { ...egg, servingUnit: "bucket" as never }), isValidation("servingUnit"))
    await assert.rejects(createFood(adminA, { ...egg, name: "  " }), isValidation("name"))
  })

  test("members cannot see archived foods; admins can", async () => {
    const tmp = (await createFood(adminA, { ...egg, name: "Temp food" })).id
    await setFoodArchived(adminA, tmp, true)
    assert.equal(await getFood(memberA1, tmp), null)
    assert.equal((await getFood(adminA, tmp))?.status, "ARCHIVED")
    assert.ok(!(await listFoods(memberA1, { includeArchived: true })).some((f) => f.id === tmp))
    assert.ok((await listFoods(adminA, { includeArchived: true })).some((f) => f.id === tmp))
    await deleteFood(adminA, tmp) // unused → hard delete allowed
    assert.equal(await getFood(adminA, tmp), null)
  })
})

// ── Diet plans ───────────────────────────────────────────────────────────

let planA: string
let breakfast: string
let lunch: string
let dinner: string
let riceInLunch: string

describe("diet plans", () => {
  test("5. gym admin creates a plan (createdBy from session)", async () => {
    planA = (await createDietPlan(adminA, { name: "Lean bulk", description: "", createdBy: memberA1.id } as never)).id
    const plans = await listDietPlans(adminA)
    assert.equal(plans.length, 1)
    assert.equal(plans[0].description, null)
    const stored = await DietPlan.findOne({ gymId: adminA.gymId, _id: planA }).lean()
    assert.equal(stored?.createdBy.toString(), adminA.id)
    assert.equal(stored?.gymId.toString(), adminA.gymId)
  })

  test("6. gym admin adds meals with custom names and times", async () => {
    breakfast = (await addDietPlanMeal(adminA, planA, { name: "Breakfast", time: "08:00" })).id
    lunch = (await addDietPlanMeal(adminA, planA, { name: "Lunch", time: "13:00" })).id
    dinner = (await addDietPlanMeal(adminA, planA, { name: "Post-workout", time: "20:30" })).id
    await updateDietPlanMeal(adminA, dinner, { name: "Dinner", time: "20:30" })
    await assert.rejects(addDietPlanMeal(adminA, planA, { name: "Snack", time: "25:00" }), isValidation("time"))
    await assert.rejects(addDietPlanMeal(adminA, planA, { name: "Snack", time: "8am" }), isValidation("time"))

    const detail = (await getDietPlanDetail(adminA, planA))!
    assert.deepEqual(detail.meals.map((m) => [m.name, m.time, m.order]), [
      ["Breakfast", "08:00", 0],
      ["Lunch", "13:00", 1],
      ["Dinner", "20:30", 2],
    ])
  })

  test("7. gym admin adds foods to meals; nutrition is computed from the food", async () => {
    await addDietPlanMealFood(adminA, breakfast, { foodId: eggA, quantity: 4, unit: "piece" })
    riceInLunch = (await addDietPlanMealFood(adminA, lunch, { foodId: riceA, quantity: "200", unit: "g" })).id
    await addDietPlanMealFood(adminA, dinner, { foodId: riceA, quantity: 1.5, unit: "serving" })

    const detail = (await getDietPlanDetail(adminA, planA))!
    assert.deepEqual(detail.meals[0].totals, { calories: 312, protein: 25.2, carbs: 2.4, fat: 21.2 })
    assert.equal(detail.meals[1].totals.calories, 260)
    assert.equal(detail.meals[2].totals.calories, 195)
    assert.equal(detail.totals.calories, 767)
    assert.equal(detail.totals.protein, 34.7) // 25.2 + 5.4 + 4.05

    // dietPlanId is derived from the meal, not the client.
    const stored = await DietPlanMealFood.findOne({ gymId: adminA.gymId, _id: riceInLunch }).lean()
    assert.equal(stored?.dietPlanId.toString(), planA)
  })

  test("planned food rules: units, quantities, other gyms' foods", async () => {
    await assert.rejects(addDietPlanMealFood(adminA, lunch, { foodId: riceA, quantity: 2, unit: "piece" }), isCode("UNIT_MISMATCH"))
    await assert.rejects(addDietPlanMealFood(adminA, lunch, { foodId: riceA, quantity: -200, unit: "g" }), isValidation("quantity"))
    await assert.rejects(addDietPlanMealFood(adminA, lunch, { foodId: riceA, quantity: 0, unit: "g" }), isValidation("quantity"))
    await assert.rejects(addDietPlanMealFood(adminA, lunch, { foodId: eggB, quantity: 1, unit: "piece" }), isCode("NOT_FOUND"))

    await updateDietPlanMealFood(adminA, riceInLunch, { quantity: 300, unit: "g" })
    assert.equal((await getDietPlanDetail(adminA, planA))!.meals[1].totals.calories, 390)
    await assert.rejects(updateDietPlanMealFood(adminA, riceInLunch, { quantity: -1, unit: "g" }), isValidation("quantity"))

    // Food in use: can't hard-delete it, can't switch it to an incompatible unit.
    await assert.rejects(deleteFood(adminA, riceA), isCode("FOOD_IN_USE"))
    await assert.rejects(updateFood(adminA, riceA, { ...rice, servingUnit: "cup" }), isCode("UNIT_MISMATCH"))
  })

  test("reorder, remove and delete keep the plan consistent", async () => {
    await reorderDietPlanMeals(adminA, planA, [dinner, breakfast, lunch])
    let detail = (await getDietPlanDetail(adminA, planA))!
    assert.deepEqual(detail.meals.map((m) => m.name), ["Dinner", "Breakfast", "Lunch"])
    await assert.rejects(reorderDietPlanMeals(adminA, planA, [dinner, breakfast]), isCode("CONFLICT"))
    await assert.rejects(reorderDietPlanMeals(adminA, planA, [dinner, dinner, lunch]), isValidation())

    await removeDietPlanMealFood(adminA, riceInLunch)
    const scratch = (await addDietPlanMeal(adminA, planA, { name: "Snack", time: "16:00" })).id
    await addDietPlanMealFood(adminA, scratch, { foodId: eggA, quantity: 2, unit: "piece" })
    await deleteDietPlanMeal(adminA, scratch)
    assert.equal(await DietPlanMealFood.countDocuments({ gymId: adminA.gymId, dietPlanMealId: scratch }), 0, "foods deleted with the meal")
    detail = (await getDietPlanDetail(adminA, planA))!
    assert.equal(detail.meals.length, 3)
    assert.equal(detail.meals.find((m) => m.name === "Lunch")!.foods.length, 0)
  })

  test("4. gym admin cannot read or modify another gym's plan, meals or planned foods", async () => {
    assert.equal(await getDietPlanDetail(adminB, planA), null)
    assert.equal((await listDietPlans(adminB)).length, 0)
    await assert.rejects(updateDietPlan(adminB, planA, { name: "Hijack" }), isCode("NOT_FOUND"))
    await assert.rejects(setDietPlanArchived(adminB, planA, true), isCode("NOT_FOUND"))
    await assert.rejects(addDietPlanMeal(adminB, planA, { name: "X", time: "10:00" }), isCode("NOT_FOUND"))
    await assert.rejects(updateDietPlanMeal(adminB, breakfast, { name: "X", time: "10:00" }), isCode("NOT_FOUND"))
    await assert.rejects(deleteDietPlanMeal(adminB, breakfast), isCode("NOT_FOUND"))
    await assert.rejects(reorderDietPlanMeals(adminB, planA, [dinner, breakfast, lunch]), isCode("NOT_FOUND"))
    await assert.rejects(addDietPlanMealFood(adminB, breakfast, { foodId: eggB, quantity: 1, unit: "piece" }), isCode("NOT_FOUND"))
    assert.equal((await getDietPlanDetail(adminA, planA))!.name, "Lean bulk")
  })

  test("14. invalid ids are rejected", async () => {
    for (const bad of ["", "123", "not-an-id", '{"$ne":null}', "zzzzzzzzzzzzzzzzzzzzzzzz"]) {
      await assert.rejects(getDietPlanDetail(adminA, bad), isValidation())
      await assert.rejects(addDietPlanMeal(adminA, bad, { name: "X", time: "10:00" }), isValidation())
      await assert.rejects(gymMemberTarget(adminA, bad), isValidation())
      await assert.rejects(assignDietPlan(adminA, { dietPlanId: bad, memberId: memberA1.id, startDate: "2026-10-03" }), isValidation("dietPlanId"))
    }
    await assert.rejects(addDietPlanMealFood(adminA, breakfast, { foodId: "nope", quantity: 1, unit: "piece" }), isValidation("foodId"))
  })
})

// ── Assignments ──────────────────────────────────────────────────────────

describe("diet plan assignments", () => {
  test("8. gym admin assigns a plan to their own member; the member can read it", async () => {
    const { id } = await assignDietPlan(adminA, { dietPlanId: planA, memberId: memberA1.id, startDate: "2026-09-01" })
    const stored = await DietPlanAssignment.findOne({ gymId: adminA.gymId, _id: id }).lean()
    assert.equal(stored?.assignedBy.toString(), adminA.id)
    assert.equal(stored?.status, "ACTIVE")

    const mine = await getActiveDietPlan(selfTarget(memberA1))
    assert.equal(mine?.plan.id, planA)
    assert.equal(mine?.plan.meals.length, 3)
    assert.equal(await getActiveDietPlan(selfTarget(memberA2)), null, "A2 has no plan and can't see A1's")
  })

  test("re-assigning completes the previous active assignment (one active per member)", async () => {
    const planA2 = (await createDietPlan(adminA, { name: "Cut" })).id
    await assignDietPlan(adminA, { dietPlanId: planA2, memberId: memberA1.id, startDate: "2026-10-01" })
    const history = await listDietPlanAssignments(selfTarget(memberA1))
    assert.deepEqual(history.map((h) => [h.dietPlanName, h.status]), [
      ["Cut", "ACTIVE"],
      ["Lean bulk", "COMPLETED"],
    ])
    assert.equal(history[1].endDate, "2026-10-01")
    assert.equal(await DietPlanAssignment.countDocuments({ gymId: adminA.gymId, userId: memberA1.id, status: "ACTIVE" }), 1)

    // The DB itself refuses a second ACTIVE assignment.
    await assert.rejects(
      DietPlanAssignment.create({ gymId: adminA.gymId, userId: memberA1.id, dietPlanId: planA, startDate: "2026-10-02", status: "ACTIVE", assignedBy: adminA.id }),
      (error: unknown) => (error as { code?: number }).code === 11000
    )

    await endDietPlanAssignment(adminA, history[0].id, { status: "CANCELLED", endDate: "2026-10-05" })
    assert.equal(await getActiveDietPlan(selfTarget(memberA1)), null)
    await assert.rejects(endDietPlanAssignment(adminA, history[0].id, { status: "COMPLETED", endDate: "2026-10-05" }), isCode("NOT_FOUND"))
  })

  test("9/10. cross-gym assignment is impossible, whatever ids or gymId are sent", async () => {
    // Plan from gym A → member of gym B, by admin A or admin B.
    await assert.rejects(assignDietPlan(adminA, { dietPlanId: planA, memberId: memberB1.id, startDate: "2026-10-03" }), isCode("NOT_FOUND"))
    await assert.rejects(assignDietPlan(adminB, { dietPlanId: planA, memberId: memberB1.id, startDate: "2026-10-03" }), isCode("NOT_FOUND"))
    // Forged gymId / assignedBy are stripped; the admin's own gym is used.
    const planB = (await createDietPlan(adminB, { name: "B plan" })).id
    const { id } = await assignDietPlan(adminB, {
      dietPlanId: planB,
      memberId: memberB1.id,
      startDate: "2026-10-03",
      gymId: adminA.gymId,
      assignedBy: memberB1.id,
      userId: memberA1.id,
    } as never)
    const stored = await DietPlanAssignment.findOne({ gymId: adminB.gymId, _id: id }).lean()
    assert.equal(stored?.gymId.toString(), adminB.gymId)
    assert.equal(stored?.userId.toString(), memberB1.id)
    assert.equal(stored?.assignedBy.toString(), adminB.id)
    // Admin A can't end gym B's assignment.
    await assert.rejects(endDietPlanAssignment(adminA, id, { status: "CANCELLED", endDate: "2026-10-05" }), isCode("NOT_FOUND"))
  })

  test("15. archived plans can't be newly assigned or edited (existing assignments untouched)", async () => {
    await assignDietPlan(adminA, { dietPlanId: planA, memberId: memberA2.id, startDate: "2026-10-03" })
    await setDietPlanArchived(adminA, planA, true)
    await assert.rejects(assignDietPlan(adminA, { dietPlanId: planA, memberId: memberA1.id, startDate: "2026-10-03" }), isCode("PLAN_ARCHIVED"))
    await assert.rejects(addDietPlanMeal(adminA, planA, { name: "X", time: "10:00" }), isCode("PLAN_ARCHIVED"))
    await assert.rejects(updateDietPlan(adminA, planA, { name: "X" }), isCode("PLAN_ARCHIVED"))
    await assert.rejects(addDietPlanMealFood(adminA, breakfast, { foodId: eggA, quantity: 1, unit: "piece" }), isCode("PLAN_ARCHIVED"))
    assert.equal((await getActiveDietPlan(selfTarget(memberA2)))?.plan.status, "ARCHIVED", "existing assignment still readable")
    assert.equal((await listDietPlans(adminA, { status: "ARCHIVED" })).length, 1)
  })

  test("invalid assignment dates are rejected", async () => {
    await assert.rejects(
      assignDietPlan(adminB, { dietPlanId: planA, memberId: memberB1.id, startDate: "2026-10-10", endDate: "2026-10-01" }),
      isValidation("endDate")
    )
    await assert.rejects(assignDietPlan(adminB, { dietPlanId: planA, memberId: memberB1.id, startDate: "yesterday" }), isValidation("startDate"))
  })
})

// ── Daily logs ───────────────────────────────────────────────────────────

describe("daily nutrition logs", () => {
  test("get-or-create is idempotent and per member per day", async () => {
    const me = selfTarget(memberA1)
    const first = await getOrCreateDailyNutritionLog(me, "2026-10-01")
    const again = await getOrCreateDailyNutritionLog(me, "2026-10-01")
    assert.equal(first.id, again.id)
    assert.deepEqual(first.totals, { calories: 0, protein: 0, carbs: null, fat: null })
    assert.equal(await getDailyNutritionLog(me, "2026-10-02"), null)
    assert.equal(await getDailyNutritionLog(selfTarget(memberA2), "2026-10-01"), null, "other member's day is separate")
    await assert.rejects(getOrCreateDailyNutritionLog(me, "01/10/2026"), isValidation())
  })

  test("gym admin can read their member's log, not another gym's", async () => {
    assert.ok(await getDailyNutritionLog(await gymMemberTarget(adminA, memberA1.id), "2026-10-01"))
    await assert.rejects(gymMemberTarget(adminB, memberA1.id), isCode("NOT_FOUND"))
  })
})

// ── Super Admin ──────────────────────────────────────────────────────────

describe("super admin", () => {
  test("12. can read nutrition data across gyms, read-only", async () => {
    const a1 = await platformMemberTarget(superAdmin, memberA1.id)
    const b1 = await platformMemberTarget(superAdmin, memberB1.id)
    assert.equal(a1.gymId, adminA.gymId)
    assert.equal(b1.gymId, adminB.gymId)
    assert.ok(await getCurrentNutritionGoal(a1, "2026-12-31"))
    assert.equal((await listDietPlanAssignments(b1))[0]?.dietPlanName, "B plan")

    const plans = await listAllDietPlans(superAdmin)
    assert.ok(plans.some((p) => p.gymId === adminA.gymId) && plans.some((p) => p.gymId === adminB.gymId))

    await assert.rejects(setNutritionGoal(a1, superAdmin, goal), ForbiddenError)
    await assert.rejects(getOrCreateDailyNutritionLog(a1, "2026-10-01"), ForbiddenError)
    await assert.rejects(platformMemberTarget(adminA as unknown as SuperAdminUser, memberB1.id), ForbiddenError)
    await assert.rejects(listAllDietPlans(adminA as unknown as SuperAdminUser), ForbiddenError)
  })
})

// ── Tenant guard on the new models ───────────────────────────────────────

describe("tenant guard", () => {
  test("unscoped queries on nutrition models throw", async () => {
    await assert.rejects(NutritionGoal.find({ userId: memberA1.id }).lean(), TenantScopeError)
    await assert.rejects(Food.findOne({ _id: eggA }).lean(), TenantScopeError)
    await assert.rejects(DietPlanAssignment.updateMany({}, { $set: { status: "CANCELLED", endDate: "2026-10-05" } }), TenantScopeError)
    await assert.rejects(DietPlanMealFood.deleteMany({}), TenantScopeError)
  })
})

// ── Calendar-date integrity (regression) ─────────────────────────────────
//
// User-facing calendar days must come from the caller (computed in the
// user/gym timezone). The server clock must never be used to derive them.
// We freeze the server clock at moments where UTC and the member's local
// day differ, and check that exactly the supplied day is stored.

/** Freeze `Date` at `iso` for the duration of `work`. */
async function withServerClock<T>(iso: string, work: () => Promise<T>): Promise<T> {
  mock.timers.enable({ apis: ["Date"], now: Date.parse(iso) })
  try {
    return await work()
  } finally {
    mock.timers.reset()
  }
}

describe("calendar dates come from the caller, never the server clock", () => {
  // 2026-10-01T20:30Z is already 2026-10-02 02:00 for a member in India (UTC+5:30).
  const SERVER_BEHIND = "2026-10-01T20:30:00Z"
  // 2026-10-02T03:00Z is still 2026-10-01 20:00 for a member in Los Angeles (UTC-7).
  const SERVER_AHEAD = "2026-10-02T03:00:00Z"

  test("setNutritionGoal stores the supplied effectiveFrom, not server UTC today", async () => {
    const me = selfTarget(memberB2)
    await withServerClock(SERVER_BEHIND, async () => {
      assert.equal(new Date().toISOString().slice(0, 10), "2026-10-01", "server clock is frozen")
      const created = await setNutritionGoal(me, memberB2, { dailyCalories: 2100, dailyProtein: 140, effectiveFrom: "2026-10-02" })
      assert.equal(created.effectiveFrom, "2026-10-02")
      const stored = await NutritionGoal.findOne({ gymId: adminB.gymId, _id: created.id }).lean()
      assert.equal(stored?.effectiveFrom, "2026-10-02")
    })
    await withServerClock(SERVER_AHEAD, async () => {
      const created = await setNutritionGoal(me, memberB2, { dailyCalories: 1900, dailyProtein: 130, effectiveFrom: "2026-09-20" })
      assert.equal(created.effectiveFrom, "2026-09-20")
    })
  })

  test("getCurrentNutritionGoal uses the supplied asOf day, whatever the server clock says", async () => {
    const me = selfTarget(memberB2)
    await withServerClock(SERVER_BEHIND, async () => {
      // Server thinks it is Oct 1; the member's Oct 1 still has the Sept 20 goal.
      assert.equal((await getCurrentNutritionGoal(me, "2026-10-01"))?.dailyCalories, 1900)
      assert.equal((await getCurrentNutritionGoal(me, "2026-10-02"))?.dailyCalories, 2100)
    })
    await withServerClock(SERVER_AHEAD, async () => {
      // Server thinks it is Oct 2; asking for the member's Oct 1 must not return the Oct 2 goal.
      assert.equal((await getCurrentNutritionGoal(me, "2026-10-01"))?.dailyCalories, 1900)
    })
  })

  test("assignDietPlan / endDietPlanAssignment store the supplied days", async () => {
    const plan1 = (await createDietPlan(adminB, { name: "TZ plan 1" })).id
    const plan2 = (await createDietPlan(adminB, { name: "TZ plan 2" })).id
    await withServerClock(SERVER_BEHIND, async () => {
      const first = await assignDietPlan(adminB, { dietPlanId: plan1, memberId: memberB2.id, startDate: "2026-10-02" })
      assert.equal((await DietPlanAssignment.findOne({ gymId: adminB.gymId, _id: first.id }).lean())?.startDate, "2026-10-02")

      // Re-assigning ends the previous plan on the supplied start day too.
      const second = await assignDietPlan(adminB, { dietPlanId: plan2, memberId: memberB2.id, startDate: "2026-10-05" })
      const prev = await DietPlanAssignment.findOne({ gymId: adminB.gymId, _id: first.id }).lean()
      assert.equal(prev?.status, "COMPLETED")
      assert.equal(prev?.endDate, "2026-10-05")

      await endDietPlanAssignment(adminB, second.id, { status: "COMPLETED", endDate: "2026-10-07" })
      assert.equal((await DietPlanAssignment.findOne({ gymId: adminB.gymId, _id: second.id }).lean())?.endDate, "2026-10-07")
    })
    await withServerClock(SERVER_AHEAD, async () => {
      const third = await assignDietPlan(adminB, { dietPlanId: plan1, memberId: memberB2.id, startDate: "2026-10-08" })
      await endDietPlanAssignment(adminB, third.id, { status: "CANCELLED", endDate: "2026-10-08" })
      const stored = await DietPlanAssignment.findOne({ gymId: adminB.gymId, _id: third.id }).lean()
      assert.deepEqual([stored?.startDate, stored?.endDate, stored?.status], ["2026-10-08", "2026-10-08", "CANCELLED"])
    })
  })

  test("an end date before the assignment's start is rejected", async () => {
    const plan = (await createDietPlan(adminB, { name: "TZ plan 3" })).id
    const { id } = await assignDietPlan(adminB, { dietPlanId: plan, memberId: memberB2.id, startDate: "2026-11-10" })
    await assert.rejects(endDietPlanAssignment(adminB, id, { status: "CANCELLED", endDate: "2026-11-09" }), isValidation("endDate"))
    await endDietPlanAssignment(adminB, id, { status: "CANCELLED", endDate: "2026-11-10" })
  })

  test("omitting a calendar date is rejected, never silently defaulted", async () => {
    const me = selfTarget(memberB2)
    const plan = (await createDietPlan(adminB, { name: "TZ plan 4" })).id
    const goalsBefore = await NutritionGoal.countDocuments({ gymId: adminB.gymId, userId: memberB2.id })
    const assignmentsBefore = await DietPlanAssignment.countDocuments({ gymId: adminB.gymId, userId: memberB2.id })

    await assert.rejects(setNutritionGoal(me, memberB2, { dailyCalories: 2000, dailyProtein: 150 } as never), isValidation("effectiveFrom"))
    await assert.rejects(setNutritionGoal(me, memberB2, { dailyCalories: 2000, dailyProtein: 150, effectiveFrom: "" }), isValidation("effectiveFrom"))
    await assert.rejects(getCurrentNutritionGoal(me, undefined as never), isValidation())
    await assert.rejects(assignDietPlan(adminB, { dietPlanId: plan, memberId: memberB2.id } as never), isValidation("startDate"))

    const { id } = await assignDietPlan(adminB, { dietPlanId: plan, memberId: memberB2.id, startDate: "2026-12-01" })
    await assert.rejects(endDietPlanAssignment(adminB, id, { status: "COMPLETED" } as never), isValidation("endDate"))
    await assert.rejects(getOrCreateDailyNutritionLog(me, undefined as never), isValidation())

    assert.equal(await NutritionGoal.countDocuments({ gymId: adminB.gymId, userId: memberB2.id }), goalsBefore, "no goal written")
    assert.equal(
      await DietPlanAssignment.countDocuments({ gymId: adminB.gymId, userId: memberB2.id }),
      assignmentsBefore + 1,
      "only the explicitly dated assignment was written"
    )
    assert.equal((await DietPlanAssignment.findOne({ gymId: adminB.gymId, _id: id }).lean())?.status, "ACTIVE", "end without a date did not end it")
  })

  test("updating a goal without effectiveFrom keeps the stored day", async () => {
    const me = selfTarget(memberB2)
    const goalId = (await getCurrentNutritionGoal(me, "2026-10-02"))!.id
    await withServerClock(SERVER_AHEAD, async () => {
      const updated = await updateNutritionGoal(me, memberB2, goalId, { dailyCalories: 2150, dailyProtein: 145 })
      assert.equal(updated.effectiveFrom, "2026-10-02")
    })
  })

  test("no server code derives a calendar day from the server clock", () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.tsx?$/.test(entry.name)) {
          const source = readFileSync(path, "utf8")
          if (/todayCalendarDate|new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(source)) offenders.push(path)
        }
      }
    }
    walk(join("src", "server"))
    walk(join("src", "lib", "nutrition"))
    walk(join("src", "lib", "validations"))
    assert.deepEqual(offenders, [])
  })
})
