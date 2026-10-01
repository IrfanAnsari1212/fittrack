import mongoose, { Types } from "mongoose"

import {
  isCompatibleUnit,
  nutritionFor,
  sumNutrition,
  ZERO_NUTRITION,
  type NutritionTotals,
} from "@/lib/nutrition/calculations"
import type { ServingUnit } from "@/lib/nutrition/units"
import {
  dietPlanMealSchema,
  dietPlanSchema,
  mealFoodQuantitySchema,
  mealFoodSchema,
  objectIdSchema,
  reorderMealsSchema,
  type DietPlanInput,
  type DietPlanMealInput,
  type MealFoodInput,
  type MealFoodQuantityInput,
} from "@/lib/validations/nutrition"
import { assertGymAdmin, assertSuperAdmin } from "@/server/auth/guards"
import { dbReady } from "@/server/db"
import { crossTenant } from "@/server/db/tenant-guard"
import { DomainError, parseInput } from "@/server/errors"
import { DietPlan } from "@/server/models/diet-plan"
import { DietPlanMeal } from "@/server/models/diet-plan-meal"
import { DietPlanMealFood } from "@/server/models/diet-plan-meal-food"
import { Food } from "@/server/models/food"
import { scopeToGym, type TenantScope } from "@/server/tenant"
import type { FoodRecord } from "@/server/services/nutrition/food-service"
import type { GymAdminUser, SuperAdminUser } from "@/types/auth"
import type { DietPlanDetail, DietPlanSummary, PlannedFoodView } from "@/types/nutrition"

/**
 * Diet plans (planned nutrition), managed by Gym Admins. Child records
 * (meals, meal foods) copy gymId/dietPlanId from their parent on the server;
 * nothing tenant-related is taken from input. Archived plans are read-only.
 */

type PlanStatus = "ACTIVE" | "ARCHIVED"

interface PlanRecord {
  _id: Types.ObjectId
  name: string
  description?: string | null
  status: PlanStatus
  createdAt: Date
  updatedAt: Date
}

interface MealRecord {
  _id: Types.ObjectId
  dietPlanId: Types.ObjectId
  name: string
  time: string
  order: number
}

interface MealFoodRecord {
  _id: Types.ObjectId
  dietPlanId: Types.ObjectId
  dietPlanMealId: Types.ObjectId
  foodId: Types.ObjectId
  quantity: number
  unit: ServingUnit
}

async function withTransaction<T>(work: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession()
  try {
    let result: T
    await session.withTransaction(async () => {
      result = await work(session)
    })
    return result!
  } finally {
    await session.endSession()
  }
}

/** Load a plan of the admin's gym that may still be edited. */
async function requireEditablePlan(admin: GymAdminUser, planId: string, session?: mongoose.ClientSession) {
  const plan = await DietPlan.findOne(scopeToGym(admin, { _id: planId }))
    .session(session ?? null)
    .lean<PlanRecord>()
  if (!plan) throw new DomainError("NOT_FOUND")
  if (plan.status !== "ACTIVE") throw new DomainError("PLAN_ARCHIVED")
  return plan
}

/** Load a meal of the admin's gym whose plan may still be edited. */
async function requireEditableMeal(admin: GymAdminUser, mealId: string) {
  const meal = await DietPlanMeal.findOne(scopeToGym(admin, { _id: mealId })).lean<MealRecord>()
  if (!meal) throw new DomainError("NOT_FOUND")
  await requireEditablePlan(admin, meal.dietPlanId.toString())
  return meal
}

/** Load a gym food usable in a plan with the given unit. */
async function requireUsableFood(admin: GymAdminUser, foodId: string, unit: ServingUnit) {
  const food = await Food.findOne(scopeToGym(admin, { _id: foodId })).lean<FoodRecord>()
  if (!food) throw new DomainError("NOT_FOUND")
  if (food.status !== "ACTIVE") throw new DomainError("FOOD_ARCHIVED")
  if (!isCompatibleUnit(food, unit)) throw new DomainError("UNIT_MISMATCH")
  return food
}

// ── Plans ────────────────────────────────────────────────────────────────

export async function createDietPlan(admin: GymAdminUser, input: DietPlanInput): Promise<{ id: string }> {
  assertGymAdmin(admin)
  const data = parseInput(dietPlanSchema, input)
  await dbReady()
  const plan = await DietPlan.create({
    name: data.name,
    description: data.description,
    gymId: admin.gymId,
    createdBy: admin.id,
    status: "ACTIVE",
  })
  return { id: plan._id.toString() }
}

export async function updateDietPlan(admin: GymAdminUser, planId: string, input: DietPlanInput) {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, planId)
  const data = parseInput(dietPlanSchema, input)
  await dbReady()
  await requireEditablePlan(admin, id)
  await DietPlan.updateOne(
    scopeToGym(admin, { _id: id }),
    { $set: { name: data.name, description: data.description } },
    { runValidators: true }
  )
}

/**
 * Archive (or restore) a plan. Archiving keeps existing assignments as they
 * are; it only prevents edits and new assignments.
 */
export async function setDietPlanArchived(admin: GymAdminUser, planId: string, archived: boolean) {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, planId)
  await dbReady()
  const result = await DietPlan.updateOne(scopeToGym(admin, { _id: id }), {
    $set: { status: archived ? "ARCHIVED" : "ACTIVE" },
  })
  if (result.matchedCount === 0) throw new DomainError("NOT_FOUND")
}

async function summarize(gymId: Types.ObjectId | string, plans: PlanRecord[]): Promise<DietPlanSummary[]> {
  if (plans.length === 0) return []
  // Aggregations bypass the query guard, so gymId is matched explicitly.
  const counts = await DietPlanMeal.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { gymId: new Types.ObjectId(gymId), dietPlanId: { $in: plans.map((p) => p._id) } } },
    { $group: { _id: "$dietPlanId", count: { $sum: 1 } } },
  ])
  const countById = new Map(counts.map((c) => [c._id.toString(), c.count]))
  return plans.map((plan) => ({
    id: plan._id.toString(),
    name: plan.name,
    description: plan.description ?? null,
    status: plan.status,
    mealCount: countById.get(plan._id.toString()) ?? 0,
    updatedAt: plan.updatedAt.toISOString(),
  }))
}

export async function listDietPlans(
  admin: GymAdminUser,
  { status }: { status?: PlanStatus } = {}
): Promise<DietPlanSummary[]> {
  assertGymAdmin(admin)
  await dbReady()
  const plans = await DietPlan.find(scopeToGym(admin, status ? { status } : {}))
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean<PlanRecord[]>()
  return summarize(admin.gymId, plans)
}

/**
 * Full plan with meals, foods and computed nutrition. Internal: `scope` must
 * come from an authenticated context (admin's gym, or a member's assignment).
 */
export async function loadDietPlanDetail(scope: TenantScope, planId: string): Promise<DietPlanDetail | null> {
  await dbReady()
  const plan = await DietPlan.findOne(scopeToGym(scope, { _id: planId })).lean<PlanRecord>()
  if (!plan) return null

  const [meals, mealFoods] = await Promise.all([
    DietPlanMeal.find(scopeToGym(scope, { dietPlanId: plan._id })).sort({ order: 1, time: 1 }).lean<MealRecord[]>(),
    DietPlanMealFood.find(scopeToGym(scope, { dietPlanId: plan._id })).sort({ createdAt: 1 }).lean<MealFoodRecord[]>(),
  ])
  const foodIds = [...new Set(mealFoods.map((mf) => mf.foodId.toString()))]
  const foods = foodIds.length
    ? await Food.find(scopeToGym(scope, { _id: { $in: foodIds } })).lean<FoodRecord[]>()
    : []
  const foodById = new Map(foods.map((f) => [f._id.toString(), f]))

  const mealViews = meals.map((meal) => {
    const items: PlannedFoodView[] = mealFoods
      .filter((mf) => mf.dietPlanMealId.equals(meal._id))
      .flatMap((mf) => {
        const food = foodById.get(mf.foodId.toString())
        if (!food) return []
        let nutrition: NutritionTotals = ZERO_NUTRITION
        try {
          nutrition = nutritionFor(food, mf.quantity, mf.unit)
        } catch {
          // Defensive: updateFood prevents unit changes that would break plans.
        }
        return [
          {
            id: mf._id.toString(),
            foodId: food._id.toString(),
            foodName: food.name,
            foodStatus: food.status,
            quantity: mf.quantity,
            unit: mf.unit,
            nutrition,
          },
        ]
      })
    return {
      id: meal._id.toString(),
      name: meal.name,
      time: meal.time,
      order: meal.order,
      foods: items,
      totals: sumNutrition(items.map((i) => i.nutrition)),
    }
  })

  return {
    id: plan._id.toString(),
    name: plan.name,
    description: plan.description ?? null,
    status: plan.status,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    meals: mealViews,
    totals: sumNutrition(mealViews.map((m) => m.totals)),
  }
}

export async function getDietPlanDetail(admin: GymAdminUser, planId: string): Promise<DietPlanDetail | null> {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, planId)
  return loadDietPlanDetail(admin, id)
}

/** Super Admin: every gym's plans (intentional cross-tenant read). */
export async function listAllDietPlans(
  actor: SuperAdminUser
): Promise<(DietPlanSummary & { gymId: string })[]> {
  assertSuperAdmin(actor)
  await dbReady()
  const plans = await crossTenant(DietPlan.find({}))
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean<(PlanRecord & { gymId: Types.ObjectId })[]>()
  return plans.map((plan) => ({
    id: plan._id.toString(),
    gymId: plan.gymId.toString(),
    name: plan.name,
    description: plan.description ?? null,
    status: plan.status,
    mealCount: 0,
    updatedAt: plan.updatedAt.toISOString(),
  }))
}

// ── Meals ────────────────────────────────────────────────────────────────

export async function addDietPlanMeal(
  admin: GymAdminUser,
  planId: string,
  input: DietPlanMealInput
): Promise<{ id: string }> {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, planId)
  const data = parseInput(dietPlanMealSchema, input)
  await dbReady()
  const plan = await requireEditablePlan(admin, id)
  const last = await DietPlanMeal.findOne(scopeToGym(admin, { dietPlanId: plan._id }))
    .sort({ order: -1 })
    .select("order")
    .lean<{ order: number }>()
  const meal = await DietPlanMeal.create({
    gymId: admin.gymId,
    dietPlanId: plan._id,
    name: data.name,
    time: data.time,
    order: (last?.order ?? -1) + 1,
  })
  return { id: meal._id.toString() }
}

export async function updateDietPlanMeal(admin: GymAdminUser, mealId: string, input: DietPlanMealInput) {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, mealId)
  const data = parseInput(dietPlanMealSchema, input)
  await dbReady()
  await requireEditableMeal(admin, id)
  await DietPlanMeal.updateOne(
    scopeToGym(admin, { _id: id }),
    { $set: { name: data.name, time: data.time } },
    { runValidators: true }
  )
}

/** Deletes the meal and its planned foods together. */
export async function deleteDietPlanMeal(admin: GymAdminUser, mealId: string) {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, mealId)
  await dbReady()
  await requireEditableMeal(admin, id)
  await withTransaction(async (session) => {
    await DietPlanMealFood.deleteMany(scopeToGym(admin, { dietPlanMealId: id })).session(session)
    await DietPlanMeal.deleteOne(scopeToGym(admin, { _id: id })).session(session)
  })
}

/** `mealIds` must be exactly the plan's meals, in the new order. */
export async function reorderDietPlanMeals(admin: GymAdminUser, planId: string, mealIds: string[]) {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, planId)
  const ordered = parseInput(reorderMealsSchema, mealIds)
  await dbReady()
  await withTransaction(async (session) => {
    const plan = await requireEditablePlan(admin, id, session)
    const existing = await DietPlanMeal.find(scopeToGym(admin, { dietPlanId: plan._id }))
      .select("_id")
      .session(session)
      .lean<{ _id: Types.ObjectId }[]>()
    const existingIds = new Set(existing.map((m) => m._id.toString()))
    const sameSet =
      existing.length === ordered.length && ordered.every((mealId) => existingIds.has(mealId.toLowerCase()))
    if (!sameSet) throw new DomainError("CONFLICT", "Meal list is out of date")

    for (const [order, mealId] of ordered.entries()) {
      await DietPlanMeal.updateOne(scopeToGym(admin, { _id: mealId, dietPlanId: plan._id }), { $set: { order } }).session(session)
    }
  })
}

// ── Planned foods ────────────────────────────────────────────────────────

export async function addDietPlanMealFood(
  admin: GymAdminUser,
  mealId: string,
  input: MealFoodInput
): Promise<{ id: string }> {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, mealId)
  const data = parseInput(mealFoodSchema, input)
  await dbReady()
  const meal = await requireEditableMeal(admin, id)
  await requireUsableFood(admin, data.foodId, data.unit)
  const item = await DietPlanMealFood.create({
    gymId: admin.gymId,
    dietPlanId: meal.dietPlanId, // from the meal, not the client
    dietPlanMealId: meal._id,
    foodId: data.foodId,
    quantity: data.quantity,
    unit: data.unit,
  })
  return { id: item._id.toString() }
}

export async function updateDietPlanMealFood(
  admin: GymAdminUser,
  mealFoodId: string,
  input: MealFoodQuantityInput
) {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, mealFoodId)
  const data = parseInput(mealFoodQuantitySchema, input)
  await dbReady()
  const item = await DietPlanMealFood.findOne(scopeToGym(admin, { _id: id })).lean<MealFoodRecord>()
  if (!item) throw new DomainError("NOT_FOUND")
  await requireEditablePlan(admin, item.dietPlanId.toString())
  const food = await Food.findOne(scopeToGym(admin, { _id: item.foodId })).lean<FoodRecord>()
  if (!food) throw new DomainError("NOT_FOUND")
  if (!isCompatibleUnit(food, data.unit)) throw new DomainError("UNIT_MISMATCH")
  await DietPlanMealFood.updateOne(
    scopeToGym(admin, { _id: id }),
    { $set: { quantity: data.quantity, unit: data.unit } },
    { runValidators: true }
  )
}

export async function removeDietPlanMealFood(admin: GymAdminUser, mealFoodId: string) {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, mealFoodId)
  await dbReady()
  const item = await DietPlanMealFood.findOne(scopeToGym(admin, { _id: id })).lean<MealFoodRecord>()
  if (!item) throw new DomainError("NOT_FOUND")
  await requireEditablePlan(admin, item.dietPlanId.toString())
  await DietPlanMealFood.deleteOne(scopeToGym(admin, { _id: id }))
}
