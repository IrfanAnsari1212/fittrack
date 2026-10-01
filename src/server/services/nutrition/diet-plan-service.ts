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
import { assertSuperAdmin, ForbiddenError } from "@/server/auth/guards"
import { dbReady } from "@/server/db"
import { crossTenant } from "@/server/db/tenant-guard"
import { DomainError, parseInput } from "@/server/errors"
import { DietPlan } from "@/server/models/diet-plan"
import { DietPlanMeal } from "@/server/models/diet-plan-meal"
import { DietPlanMealFood } from "@/server/models/diet-plan-meal-food"
import { Food } from "@/server/models/food"
import { scopeToGym, type TenantScope } from "@/server/tenant"
import type { FoodRecord } from "@/server/services/nutrition/food-service"
import type { GymAdminUser, MemberUser, SuperAdminUser } from "@/types/auth"
import type { DietPlanDetail, DietPlanSummary, PlannedFoodView } from "@/types/nutrition"

/**
 * Diet plans (planned nutrition).
 *
 * Two kinds of plans share these functions and models:
 *  - GYM plans (ownerUserId = null): the gym's shared library, edited by
 *    Gym Admins and assignable to any member of the gym.
 *  - PERSONAL plans (ownerUserId = a member): edited only by that member
 *    and only ever assigned to them.
 *
 * Editing functions take a `PlanEditor` and derive the scope from its role
 * (`editorScope`): an admin can only reach gym plans, a member only their
 * own personal plans. A member can therefore never mutate a shared gym plan
 * — it is simply "not found" from their side. Child records (meals, planned
 * foods) are reached through their plan, so the same rule covers them.
 * Archived plans are read-only.
 */

export type PlanEditor = GymAdminUser | MemberUser

type PlanStatus = "ACTIVE" | "ARCHIVED"

interface PlanRecord {
  _id: Types.ObjectId
  gymId: Types.ObjectId
  name: string
  description?: string | null
  status: PlanStatus
  ownerUserId?: Types.ObjectId | null
  sourcePlanId?: Types.ObjectId | null
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

interface EditorScope extends TenantScope {
  /** null = gym plans (admins); a member id = that member's personal plans. */
  ownerUserId: string | null
}

/** Which plans this editor may modify (and list as "theirs"). */
function editorScope(editor: PlanEditor): EditorScope {
  if (editor?.role === "GYM_ADMIN" && editor.gymId) return { gymId: editor.gymId, ownerUserId: null }
  if (editor?.role === "MEMBER" && editor.gymId) return { gymId: editor.gymId, ownerUserId: editor.id }
  throw new ForbiddenError()
}

/** `filter AND gymId AND ownerUserId` for the editor's plans. */
function planFilter<F extends object>(scope: EditorScope, filter?: F) {
  return scopeToGym(scope, {
    ...filter,
    ownerUserId: scope.ownerUserId ? new Types.ObjectId(scope.ownerUserId) : null,
  })
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

/** Load one of the editor's plans that may still be edited. */
async function requireEditablePlan(scope: EditorScope, planId: string, session?: mongoose.ClientSession) {
  const plan = await DietPlan.findOne(planFilter(scope, { _id: planId }))
    .session(session ?? null)
    .lean<PlanRecord>()
  if (!plan) throw new DomainError("NOT_FOUND")
  if (plan.status !== "ACTIVE") throw new DomainError("PLAN_ARCHIVED")
  return plan
}

/** Load a meal whose plan belongs to the editor and may still be edited. */
async function requireEditableMeal(scope: EditorScope, mealId: string) {
  const meal = await DietPlanMeal.findOne(scopeToGym(scope, { _id: mealId })).lean<MealRecord>()
  if (!meal) throw new DomainError("NOT_FOUND")
  await requireEditablePlan(scope, meal.dietPlanId.toString())
  return meal
}

/** Load a planned food whose plan belongs to the editor and may still be edited. */
async function requireEditableMealFood(scope: EditorScope, mealFoodId: string) {
  const item = await DietPlanMealFood.findOne(scopeToGym(scope, { _id: mealFoodId })).lean<MealFoodRecord>()
  if (!item) throw new DomainError("NOT_FOUND")
  await requireEditablePlan(scope, item.dietPlanId.toString())
  return item
}

/** Load a gym food usable in a plan with the given unit. */
async function requireUsableFood(scope: TenantScope, foodId: string, unit: ServingUnit) {
  const food = await Food.findOne(scopeToGym(scope, { _id: foodId })).lean<FoodRecord>()
  if (!food) throw new DomainError("NOT_FOUND")
  if (food.status !== "ACTIVE") throw new DomainError("FOOD_ARCHIVED")
  if (!isCompatibleUnit(food, unit)) throw new DomainError("UNIT_MISMATCH")
  return food
}

// ── Plans ────────────────────────────────────────────────────────────────

/** Admin → a gym plan; Member → a personal plan owned by them. */
export async function createDietPlan(editor: PlanEditor, input: DietPlanInput): Promise<{ id: string }> {
  const scope = editorScope(editor)
  const data = parseInput(dietPlanSchema, input)
  await dbReady()
  const plan = await DietPlan.create({
    name: data.name,
    description: data.description,
    gymId: scope.gymId,
    ownerUserId: scope.ownerUserId,
    createdBy: editor.id,
    status: "ACTIVE",
  })
  return { id: plan._id.toString() }
}

export async function updateDietPlan(editor: PlanEditor, planId: string, input: DietPlanInput) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, planId)
  const data = parseInput(dietPlanSchema, input)
  await dbReady()
  await requireEditablePlan(scope, id)
  await DietPlan.updateOne(
    planFilter(scope, { _id: id }),
    { $set: { name: data.name, description: data.description } },
    { runValidators: true }
  )
}

/**
 * Archive (or restore) a plan. Archiving keeps existing assignments as they
 * are; it only prevents edits and new assignments.
 */
export async function setDietPlanArchived(editor: PlanEditor, planId: string, archived: boolean) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, planId)
  await dbReady()
  const result = await DietPlan.updateOne(planFilter(scope, { _id: id }), {
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

/** Admin → the gym library; Member → their own personal plans. */
export async function listDietPlans(
  editor: PlanEditor,
  { status }: { status?: PlanStatus } = {}
): Promise<DietPlanSummary[]> {
  const scope = editorScope(editor)
  await dbReady()
  const plans = await DietPlan.find(planFilter(scope, status ? { status } : {}))
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean<PlanRecord[]>()
  return summarize(scope.gymId, plans)
}

/**
 * Full plan with meals, foods and computed nutrition. Internal: `scope` must
 * come from an authenticated context; `extra` narrows it further (e.g. to a
 * member's own plans).
 */
export async function loadDietPlanDetail(
  scope: TenantScope,
  planId: string,
  extra: Record<string, unknown> = {}
): Promise<DietPlanDetail | null> {
  await dbReady()
  const plan = await DietPlan.findOne(scopeToGym(scope, { ...extra, _id: planId })).lean<PlanRecord>()
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
    ownerUserId: plan.ownerUserId?.toString() ?? null,
    sourcePlanId: plan.sourcePlanId?.toString() ?? null,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    meals: mealViews,
    totals: sumNutrition(mealViews.map((m) => m.totals)),
  }
}

/**
 * Read a plan. Admin → any plan in their gym (gym plans, and members'
 * personal plans read-only); Member → only their own personal plans (a gym
 * plan assigned to them is read via `getDietPlanForDate`).
 */
export async function getDietPlanDetail(viewer: PlanEditor, planId: string): Promise<DietPlanDetail | null> {
  const scope = editorScope(viewer)
  const id = parseInput(objectIdSchema, planId)
  if (viewer.role === "GYM_ADMIN") return loadDietPlanDetail(scope, id)
  return loadDietPlanDetail(scope, id, { ownerUserId: new Types.ObjectId(viewer.id) })
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
    .lean<PlanRecord[]>()
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

/**
 * Copy a plan (meals and planned foods) into a new PERSONAL plan owned by
 * `memberId`, inside the caller's transaction. The source is only read.
 * Internal: the caller has already verified the member may use the source.
 */
export async function clonePlanForMember(
  scope: TenantScope,
  sourcePlanId: string,
  memberId: string,
  session: mongoose.ClientSession
): Promise<string> {
  const source = await DietPlan.findOne(scopeToGym(scope, { _id: sourcePlanId })).session(session).lean<PlanRecord>()
  if (!source) throw new DomainError("NOT_FOUND")

  const [copy] = await DietPlan.create(
    [
      {
        gymId: scope.gymId,
        name: `${source.name} (my version)`.slice(0, 120),
        description: source.description ?? null,
        status: "ACTIVE",
        createdBy: memberId,
        ownerUserId: memberId,
        sourcePlanId: source._id,
      },
    ],
    { session }
  )

  const meals = await DietPlanMeal.find(scopeToGym(scope, { dietPlanId: source._id })).session(session).lean<MealRecord[]>()
  const mealIdMap = new Map<string, Types.ObjectId>()
  if (meals.length) {
    const newMeals = meals.map((m) => {
      const _id = new Types.ObjectId()
      mealIdMap.set(m._id.toString(), _id)
      return { _id, gymId: scope.gymId, dietPlanId: copy._id, name: m.name, time: m.time, order: m.order }
    })
    await DietPlanMeal.insertMany(newMeals, { session })
  }

  const items = await DietPlanMealFood.find(scopeToGym(scope, { dietPlanId: source._id })).session(session).lean<MealFoodRecord[]>()
  if (items.length) {
    await DietPlanMealFood.insertMany(
      items.map((i) => ({
        gymId: scope.gymId,
        dietPlanId: copy._id,
        dietPlanMealId: mealIdMap.get(i.dietPlanMealId.toString()),
        foodId: i.foodId,
        quantity: i.quantity,
        unit: i.unit,
      })),
      { session }
    )
  }
  return copy._id.toString()
}

// ── Meals ────────────────────────────────────────────────────────────────

export async function addDietPlanMeal(
  editor: PlanEditor,
  planId: string,
  input: DietPlanMealInput
): Promise<{ id: string }> {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, planId)
  const data = parseInput(dietPlanMealSchema, input)
  await dbReady()
  const plan = await requireEditablePlan(scope, id)
  const last = await DietPlanMeal.findOne(scopeToGym(scope, { dietPlanId: plan._id }))
    .sort({ order: -1 })
    .select("order")
    .lean<{ order: number }>()
  const meal = await DietPlanMeal.create({
    gymId: scope.gymId,
    dietPlanId: plan._id,
    name: data.name,
    time: data.time,
    order: (last?.order ?? -1) + 1,
  })
  return { id: meal._id.toString() }
}

export async function updateDietPlanMeal(editor: PlanEditor, mealId: string, input: DietPlanMealInput) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, mealId)
  const data = parseInput(dietPlanMealSchema, input)
  await dbReady()
  await requireEditableMeal(scope, id)
  await DietPlanMeal.updateOne(
    scopeToGym(scope, { _id: id }),
    { $set: { name: data.name, time: data.time } },
    { runValidators: true }
  )
}

/** Deletes the meal and its planned foods together. */
export async function deleteDietPlanMeal(editor: PlanEditor, mealId: string) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, mealId)
  await dbReady()
  await requireEditableMeal(scope, id)
  await withTransaction(async (session) => {
    await DietPlanMealFood.deleteMany(scopeToGym(scope, { dietPlanMealId: id })).session(session)
    await DietPlanMeal.deleteOne(scopeToGym(scope, { _id: id })).session(session)
  })
}

/** `mealIds` must be exactly the plan's meals, in the new order. */
export async function reorderDietPlanMeals(editor: PlanEditor, planId: string, mealIds: string[]) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, planId)
  const ordered = parseInput(reorderMealsSchema, mealIds)
  await dbReady()
  await withTransaction(async (session) => {
    const plan = await requireEditablePlan(scope, id, session)
    const existing = await DietPlanMeal.find(scopeToGym(scope, { dietPlanId: plan._id }))
      .select("_id")
      .session(session)
      .lean<{ _id: Types.ObjectId }[]>()
    const existingIds = new Set(existing.map((m) => m._id.toString()))
    const sameSet =
      existing.length === ordered.length && ordered.every((mealId) => existingIds.has(mealId.toLowerCase()))
    if (!sameSet) throw new DomainError("CONFLICT", "Meal list is out of date")

    for (const [order, mealId] of ordered.entries()) {
      await DietPlanMeal.updateOne(scopeToGym(scope, { _id: mealId, dietPlanId: plan._id }), { $set: { order } }).session(session)
    }
  })
}

// ── Planned foods ────────────────────────────────────────────────────────

export async function addDietPlanMealFood(
  editor: PlanEditor,
  mealId: string,
  input: MealFoodInput
): Promise<{ id: string }> {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, mealId)
  const data = parseInput(mealFoodSchema, input)
  await dbReady()
  const meal = await requireEditableMeal(scope, id)
  await requireUsableFood(scope, data.foodId, data.unit)
  const item = await DietPlanMealFood.create({
    gymId: scope.gymId,
    dietPlanId: meal.dietPlanId, // from the meal, not the client
    dietPlanMealId: meal._id,
    foodId: data.foodId,
    quantity: data.quantity,
    unit: data.unit,
  })
  return { id: item._id.toString() }
}

export async function updateDietPlanMealFood(
  editor: PlanEditor,
  mealFoodId: string,
  input: MealFoodQuantityInput
) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, mealFoodId)
  const data = parseInput(mealFoodQuantitySchema, input)
  await dbReady()
  const item = await requireEditableMealFood(scope, id)
  const food = await Food.findOne(scopeToGym(scope, { _id: item.foodId })).lean<FoodRecord>()
  if (!food) throw new DomainError("NOT_FOUND")
  if (!isCompatibleUnit(food, data.unit)) throw new DomainError("UNIT_MISMATCH")
  await DietPlanMealFood.updateOne(
    scopeToGym(scope, { _id: id }),
    { $set: { quantity: data.quantity, unit: data.unit } },
    { runValidators: true }
  )
}

export async function removeDietPlanMealFood(editor: PlanEditor, mealFoodId: string) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, mealFoodId)
  await dbReady()
  await requireEditableMealFood(scope, id)
  await DietPlanMealFood.deleteOne(scopeToGym(scope, { _id: id }))
}
