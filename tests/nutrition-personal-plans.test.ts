/**
 * Member-owned diets: personal plans and "customize my assigned plan"
 * (clone-on-customize). Verifies the gym's shared plans stay immutable from
 * the member side, customizations are isolated per member, history and
 * snapshots stay correct, and tenant isolation holds.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

import { MongoMemoryReplSet } from "mongodb-memory-server"

import { loadSessionUser } from "@/server/auth/account"
import { ForbiddenError } from "@/server/auth/guards"
import { disconnectFromDatabase } from "@/server/db/connect"
import { crossTenant } from "@/server/db/tenant-guard"
import { DomainError, ValidationError } from "@/server/errors"
import { DietPlan } from "@/server/models/diet-plan"
import { DietPlanAssignment } from "@/server/models/diet-plan-assignment"
import { User } from "@/server/models/user"
import {
  assignDietPlan,
  assignMyDietPlan,
  customizeMyDietPlan,
  endDietPlanAssignment,
  getDietPlanForDate,
  listDietPlanAssignments,
} from "@/server/services/nutrition/assignment-service"
import { getDailyNutritionLog, logConsumption } from "@/server/services/nutrition/daily-log-service"
import {
  addDietPlanMeal,
  addDietPlanMealFood,
  createDietPlan,
  deleteDietPlanMeal,
  getDietPlanDetail,
  listDietPlans,
  removeDietPlanMealFood,
  reorderDietPlanMeals,
  setDietPlanArchived,
  updateDietPlan,
  updateDietPlanMeal,
  updateDietPlanMealFood,
} from "@/server/services/nutrition/diet-plan-service"
import { createFood, updateFood } from "@/server/services/nutrition/food-service"
import { gymMemberTarget, selfTarget } from "@/server/services/nutrition/member-target"
import type { GymAdminUser, MemberUser, SessionUser } from "@/types/auth"

import { devAccounts, seedDevelopmentData } from "../scripts/lib/seed-data"

const [gymA, gymB] = devAccounts.gyms
let replSet: MongoMemoryReplSet
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

const eggsInput = { name: "Eggs", servingSize: 1, servingUnit: "piece", calories: 70, protein: 6 } as const
let eggs: string
let oats: string
let gymPlan: string
let gymBreakfast: string
let gymEggsItem: string

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ launchTimeout: 60_000 }],
  })
  process.env.MONGODB_URI = replSet.getUri("fittrack-personal-plans-test")
  await seedDevelopmentData("test-password-123")
  adminA = (await contextFor(gymA.admin.email)) as GymAdminUser
  adminB = (await contextFor(gymB.admin.email)) as GymAdminUser
  memberA1 = (await contextFor(gymA.members[0].email)) as MemberUser
  memberA2 = (await contextFor(gymA.members[1].email)) as MemberUser
  memberB1 = (await contextFor(gymB.members[0].email)) as MemberUser

  eggs = (await createFood(adminA, eggsInput)).id
  oats = (await createFood(adminA, { name: "Oats", servingSize: 40, servingUnit: "g", calories: 150, protein: 5 })).id

  // A shared gym plan assigned to BOTH members of gym A.
  gymPlan = (await createDietPlan(adminA, { name: "Gym Muscle Gain" })).id
  gymBreakfast = (await addDietPlanMeal(adminA, gymPlan, { name: "Breakfast", time: "08:00" })).id
  gymEggsItem = (await addDietPlanMealFood(adminA, gymBreakfast, { foodId: eggs, quantity: 4, unit: "piece" })).id
  await assignDietPlan(adminA, { dietPlanId: gymPlan, memberId: memberA1.id, startDate: "2026-10-01" })
  await assignDietPlan(adminA, { dietPlanId: gymPlan, memberId: memberA2.id, startDate: "2026-10-01" })
})

after(async () => {
  await disconnectFromDatabase()
  await replSet?.stop()
})

describe("member's own diet plans", () => {
  let myPlan: string
  let myMeal: string

  test("member creates their own plan (owned by them, not in the gym library)", async () => {
    myPlan = (await createDietPlan(memberA1, { name: "My Cut", createdBy: adminA.id, gymId: adminB.gymId } as never)).id
    const stored = await DietPlan.findOne({ gymId: adminA.gymId, _id: myPlan }).lean()
    assert.equal(stored?.ownerUserId?.toString(), memberA1.id)
    assert.equal(stored?.createdBy.toString(), memberA1.id, "forged createdBy ignored")
    assert.equal(stored?.gymId.toString(), adminA.gymId, "forged gymId ignored")

    assert.deepEqual((await listDietPlans(memberA1)).map((p) => p.name), ["My Cut"])
    assert.ok(!(await listDietPlans(adminA)).some((p) => p.id === myPlan), "not in the admin's gym library")
    assert.deepEqual(await listDietPlans(memberA2), [], "other members don't see it")
  })

  test("member edits their own plan: details, meals, foods, order, archive", async () => {
    await updateDietPlan(memberA1, myPlan, { name: "My Lean Cut" })
    myMeal = (await addDietPlanMeal(memberA1, myPlan, { name: "Breakfast", time: "07:30" })).id
    const second = (await addDietPlanMeal(memberA1, myPlan, { name: "Snack", time: "16:00" })).id
    await updateDietPlanMeal(memberA1, second, { name: "Afternoon snack", time: "16:30" })
    const item = (await addDietPlanMealFood(memberA1, myMeal, { foodId: oats, quantity: 80, unit: "g" })).id
    await updateDietPlanMealFood(memberA1, item, { quantity: 120, unit: "g" })
    await reorderDietPlanMeals(memberA1, myPlan, [second, myMeal])
    const detail = (await getDietPlanDetail(memberA1, myPlan))!
    assert.equal(detail.name, "My Lean Cut")
    assert.equal(detail.ownerUserId, memberA1.id)
    assert.deepEqual(detail.meals.map((m) => m.name), ["Afternoon snack", "Breakfast"])
    assert.equal(detail.totals.calories, 450) // 120 g oats = 3 servings × 150
    await removeDietPlanMealFood(memberA1, item)
    await deleteDietPlanMeal(memberA1, second)
    assert.equal((await getDietPlanDetail(memberA1, myPlan))!.meals.length, 1)
  })

  test("member switches to their own plan (explicit replace), then history stays correct", async () => {
    await assert.rejects(
      assignMyDietPlan(memberA1, { dietPlanId: myPlan, startDate: "2026-10-05" }),
      isCode("ACTIVE_ASSIGNMENT_EXISTS")
    )
    await assignMyDietPlan(memberA1, { dietPlanId: myPlan, startDate: "2026-10-05", replaceActive: true })
    const me = selfTarget(memberA1)
    assert.equal((await getDietPlanForDate(me, "2026-10-04"))?.plan.name, "Gym Muscle Gain", "earlier days unchanged")
    assert.equal((await getDietPlanForDate(me, "2026-10-05"))?.plan.name, "My Lean Cut")
    const history = await listDietPlanAssignments(me)
    assert.deepEqual(history.map((h) => [h.dietPlanName, h.dietPlanKind, h.status]), [
      ["My Lean Cut", "PERSONAL", "ACTIVE"],
      ["Gym Muscle Gain", "GYM", "COMPLETED"],
    ])
    assert.equal(history[0].assignedBy, memberA1.id)
  })

  test("a member can't self-assign a gym plan or someone else's plan", async () => {
    await assert.rejects(assignMyDietPlan(memberA2, { dietPlanId: gymPlan, startDate: "2026-10-06", replaceActive: true }), isCode("NOT_FOUND"))
    await assert.rejects(assignMyDietPlan(memberA2, { dietPlanId: myPlan, startDate: "2026-10-06", replaceActive: true }), isCode("NOT_FOUND"))
  })

  test("archived personal plans are read-only", async () => {
    const tmp = (await createDietPlan(memberA1, { name: "Old idea" })).id
    await setDietPlanArchived(memberA1, tmp, true)
    await assert.rejects(addDietPlanMeal(memberA1, tmp, { name: "X", time: "10:00" }), isCode("PLAN_ARCHIVED"))
    await assert.rejects(assignMyDietPlan(memberA1, { dietPlanId: tmp, startDate: "2026-10-07", replaceActive: true }), isCode("PLAN_ARCHIVED"))
  })
})

describe("the admin's shared plan is immutable from the member side", () => {
  test("every plan/meal/food mutation by a member on a gym plan is 'not found'", async () => {
    await assert.rejects(updateDietPlan(memberA2, gymPlan, { name: "Hijack" }), isCode("NOT_FOUND"))
    await assert.rejects(setDietPlanArchived(memberA2, gymPlan, true), isCode("NOT_FOUND"))
    await assert.rejects(addDietPlanMeal(memberA2, gymPlan, { name: "X", time: "10:00" }), isCode("NOT_FOUND"))
    await assert.rejects(updateDietPlanMeal(memberA2, gymBreakfast, { name: "X", time: "10:00" }), isCode("NOT_FOUND"))
    await assert.rejects(deleteDietPlanMeal(memberA2, gymBreakfast), isCode("NOT_FOUND"))
    await assert.rejects(reorderDietPlanMeals(memberA2, gymPlan, [gymBreakfast]), isCode("NOT_FOUND"))
    await assert.rejects(addDietPlanMealFood(memberA2, gymBreakfast, { foodId: oats, quantity: 40, unit: "g" }), isCode("NOT_FOUND"))
    await assert.rejects(updateDietPlanMealFood(memberA2, gymEggsItem, { quantity: 1, unit: "piece" }), isCode("NOT_FOUND"))
    await assert.rejects(removeDietPlanMealFood(memberA2, gymEggsItem), isCode("NOT_FOUND"))
    assert.equal(await getDietPlanDetail(memberA2, gymPlan), null, "members read gym plans only via their assignment")

    const detail = (await getDietPlanDetail(adminA, gymPlan))!
    assert.equal(detail.name, "Gym Muscle Gain")
    assert.equal(detail.meals[0].foods[0].quantity, 4)
  })
})

describe("customizing an assigned gym plan (clone-on-customize)", () => {
  let copy: string

  test("creates a personal copy for this member only; the gym plan is untouched", async () => {
    const result = await customizeMyDietPlan(memberA2, { startDate: "2026-10-10" })
    assert.equal(result.copied, true)
    copy = result.planId
    const stored = await DietPlan.findOne({ gymId: adminA.gymId, _id: copy }).lean()
    assert.equal(stored?.ownerUserId?.toString(), memberA2.id)
    assert.equal(stored?.sourcePlanId?.toString(), gymPlan)

    // Copy has the same structure; customize it.
    const before = (await getDietPlanDetail(memberA2, copy))!
    assert.deepEqual(before.meals.map((m) => [m.name, m.foods[0]?.quantity]), [["Breakfast", 4]])
    const copyEggs = before.meals[0].foods[0].id
    assert.notEqual(copyEggs, gymEggsItem, "planned foods are new records")
    await updateDietPlanMealFood(memberA2, copyEggs, { quantity: 2, unit: "piece" })
    await addDietPlanMeal(memberA2, copy, { name: "Late snack", time: "22:00" })

    // The gym plan is unchanged.
    const gym = (await getDietPlanDetail(adminA, gymPlan))!
    assert.equal(gym.meals.length, 1)
    assert.equal(gym.meals[0].foods[0].quantity, 4)
  })

  test("another member assigned to the gym plan is unaffected", async () => {
    // Re-assign the gym plan to A1 (who had moved to a personal plan).
    await assignDietPlan(adminA, { dietPlanId: gymPlan, memberId: memberA1.id, startDate: "2026-10-12", replaceActive: true })
    const a1Day = (await getDietPlanForDate(selfTarget(memberA1), "2026-10-12"))!
    assert.equal(a1Day.plan.id, gymPlan)
    assert.equal(a1Day.plan.meals.length, 1)
    assert.equal(a1Day.plan.meals[0].foods[0].quantity, 4)
  })

  test("history: before the customize day the gym plan applies, from it the copy", async () => {
    const a2 = selfTarget(memberA2)
    assert.equal((await getDietPlanForDate(a2, "2026-10-09"))?.plan.id, gymPlan)
    assert.equal((await getDietPlanForDate(a2, "2026-10-10"))?.plan.id, copy)
    const history = await listDietPlanAssignments(a2)
    assert.deepEqual(history.map((h) => [h.dietPlanKind, h.status, h.startDate, h.endDate]), [
      ["PERSONAL", "ACTIVE", "2026-10-10", null],
      ["GYM", "COMPLETED", "2026-10-01", "2026-10-10"],
    ])
  })

  test("customizing again just returns the existing personal plan", async () => {
    const again = await customizeMyDietPlan(memberA2, { startDate: "2026-10-11" })
    assert.deepEqual(again, { planId: copy, copied: false })
    assert.equal(await DietPlan.countDocuments({ gymId: adminA.gymId, ownerUserId: memberA2.id }), 1)
  })

  test("customize needs an explicit local date and an active plan", async () => {
    await assert.rejects(customizeMyDietPlan(memberA2, {} as never), isValidation("startDate"))
    await assert.rejects(customizeMyDietPlan(memberB1, { startDate: "2026-10-10" }), isCode("NOT_FOUND"))
    await assert.rejects(customizeMyDietPlan(adminA as unknown as MemberUser, { startDate: "2026-10-10" }), ForbiddenError)
  })

  test("actual logging against the personal plan still uses snapshots", async () => {
    const a2 = selfTarget(memberA2)
    const meal = (await getDietPlanForDate(a2, "2026-10-10"))!.plan.meals.find((m) => m.name === "Breakfast")!
    const log = await logConsumption(a2, "2026-10-10", { dietPlanMealId: meal.id, items: [{ foodId: eggs, quantity: 3, unit: "piece" }] })
    assert.deepEqual([log.entries[0].calories, log.entries[0].protein], [210, 18])
    await updateFood(adminA, eggs, { ...eggsInput, calories: 90, protein: 8 })
    const after = (await getDailyNutritionLog(a2, "2026-10-10"))!
    assert.deepEqual([after.entries[0].calories, after.entries[0].protein], [210, 18])
    // A gym-plan meal id can't be linked on a day the member is on their copy.
    await assert.rejects(
      logConsumption(a2, "2026-10-10", { dietPlanMealId: gymBreakfast, items: [{ foodId: eggs, quantity: 1, unit: "piece" }] }),
      isCode("NOT_FOUND")
    )
  })
})

describe("admins and tenant isolation", () => {
  test("admin still manages gym plans and assignments; sees personal plans read-only", async () => {
    await updateDietPlan(adminA, gymPlan, { name: "Gym Muscle Gain v2" })
    const personal = (await listDietPlans(memberA2))[0]
    const view = await getDietPlanDetail(adminA, personal.id)
    assert.equal(view?.ownerUserId, memberA2.id, "admin can view a member's personal plan")
    await assert.rejects(updateDietPlan(adminA, personal.id, { name: "Admin edit" }), isCode("NOT_FOUND"))
    await assert.rejects(addDietPlanMeal(adminA, personal.id, { name: "X", time: "10:00" }), isCode("NOT_FOUND"))
    // A member's personal plan can't be assigned to anyone else.
    await assert.rejects(
      assignDietPlan(adminA, { dietPlanId: personal.id, memberId: memberA1.id, startDate: "2026-10-20", replaceActive: true }),
      isCode("NOT_FOUND")
    )
    // Admin can still end the member's (personal) assignment.
    const active = (await listDietPlanAssignments(await gymMemberTarget(adminA, memberA2.id))).find((a) => a.status === "ACTIVE")!
    await endDietPlanAssignment(adminA, active.id, { status: "COMPLETED", endDate: "2026-10-20" })
    assert.equal(await DietPlanAssignment.countDocuments({ gymId: adminA.gymId, userId: memberA2.id, status: "ACTIVE" }), 0)
  })

  test("other gyms see nothing and can touch nothing", async () => {
    const personal = (await listDietPlans(memberA2))[0]
    assert.equal(await getDietPlanDetail(adminB, personal.id), null)
    assert.equal(await getDietPlanDetail(memberB1, personal.id), null)
    await assert.rejects(updateDietPlan(memberB1, personal.id, { name: "X" }), isCode("NOT_FOUND"))
    await assert.rejects(addDietPlanMeal(adminB, gymPlan, { name: "X", time: "10:00" }), isCode("NOT_FOUND"))
    await assert.rejects(assignMyDietPlan(memberB1, { dietPlanId: personal.id, startDate: "2026-10-20" }), isCode("NOT_FOUND"))
    // B1's own personal plan lives in gym B and is invisible to gym A.
    const bPlan = (await createDietPlan(memberB1, { name: "B personal" })).id
    assert.equal((await DietPlan.findOne({ gymId: adminB.gymId, _id: bPlan }).lean())?.gymId.toString(), adminB.gymId)
    assert.equal(await getDietPlanDetail(adminA, bPlan), null)
    assert.equal(await getDietPlanDetail(memberA1, bPlan), null)
  })
})
