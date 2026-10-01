import type { Types } from "mongoose"

import type { ServingUnit } from "@/lib/nutrition/units"
import { foodSchema, objectIdSchema, type FoodInput } from "@/lib/validations/nutrition"
import { assertGymAdmin, assertGymUser } from "@/server/auth/guards"
import { dbReady } from "@/server/db"
import { DomainError, parseInput } from "@/server/errors"
import { DietPlanMealFood } from "@/server/models/diet-plan-meal-food"
import { Food } from "@/server/models/food"
import { scopeToGym } from "@/server/tenant"
import type { GymAdminUser, GymUser } from "@/types/auth"
import type { FoodView } from "@/types/nutrition"

/**
 * The gym's food library. Gym Admins manage it; members of the same gym can
 * read active foods (needed for logging in Module 3B). Every query is
 * scoped to the caller's gym.
 */

export interface FoodRecord {
  _id: Types.ObjectId
  name: string
  servingSize: number
  servingUnit: ServingUnit
  calories: number
  protein: number
  carbs?: number | null
  fat?: number | null
  status: "ACTIVE" | "ARCHIVED"
}

export function toFoodView(food: FoodRecord): FoodView {
  return {
    id: food._id.toString(),
    name: food.name,
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs ?? null,
    fat: food.fat ?? null,
    status: food.status,
  }
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export async function listFoods(
  user: GymUser,
  { query, includeArchived = false }: { query?: string; includeArchived?: boolean } = {}
): Promise<FoodView[]> {
  assertGymUser(user)
  await dbReady()
  const filter: Record<string, unknown> = {}
  // Only admins may see archived foods.
  if (!(includeArchived && user.role === "GYM_ADMIN")) filter.status = "ACTIVE"
  const search = query?.trim().slice(0, 100)
  if (search) filter.name = new RegExp(escapeRegex(search), "i")

  const foods = await Food.find(scopeToGym(user, filter))
    .sort({ name: 1 })
    .limit(500)
    .lean<FoodRecord[]>()
  return foods.map(toFoodView)
}

export async function getFood(user: GymUser, foodId: string): Promise<FoodView | null> {
  assertGymUser(user)
  const id = parseInput(objectIdSchema, foodId)
  await dbReady()
  const filter: Record<string, unknown> = { _id: id }
  if (user.role !== "GYM_ADMIN") filter.status = "ACTIVE"
  const food = await Food.findOne(scopeToGym(user, filter)).lean<FoodRecord>()
  return food ? toFoodView(food) : null
}

export async function createFood(admin: GymAdminUser, input: FoodInput): Promise<FoodView> {
  assertGymAdmin(admin)
  const data = parseInput(foodSchema, input)
  await dbReady()
  const food = await Food.create({ ...data, gymId: admin.gymId, status: "ACTIVE" })
  return toFoodView(food.toObject() as FoodRecord)
}

/**
 * Editing a food changes every plan that uses it (plans compute nutrition
 * from the food). Logged history is unaffected: logs store snapshots.
 */
export async function updateFood(
  admin: GymAdminUser,
  foodId: string,
  input: FoodInput
): Promise<FoodView> {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, foodId)
  const data = parseInput(foodSchema, input)
  await dbReady()
  // Changing the unit must not break plans that quantify this food in the old unit.
  const incompatible = await DietPlanMealFood.exists(
    scopeToGym(admin, { foodId: id, unit: { $nin: [data.servingUnit, "serving"] } })
  )
  if (incompatible) {
    throw new DomainError("UNIT_MISMATCH", "Diet plans use this food in its current unit")
  }
  const food = await Food.findOneAndUpdate(
    scopeToGym(admin, { _id: id }),
    { $set: data },
    { returnDocument: "after", runValidators: true }
  ).lean<FoodRecord>()
  if (!food) throw new DomainError("NOT_FOUND")
  return toFoodView(food)
}

export async function setFoodArchived(
  admin: GymAdminUser,
  foodId: string,
  archived: boolean
): Promise<void> {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, foodId)
  await dbReady()
  const result = await Food.updateOne(scopeToGym(admin, { _id: id }), {
    $set: { status: archived ? "ARCHIVED" : "ACTIVE" },
  })
  if (result.matchedCount === 0) throw new DomainError("NOT_FOUND")
}

/** Hard delete, only for foods no diet plan uses (otherwise archive). */
export async function deleteFood(admin: GymAdminUser, foodId: string): Promise<void> {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, foodId)
  await dbReady()
  if (await DietPlanMealFood.exists(scopeToGym(admin, { foodId: id }))) {
    throw new DomainError("FOOD_IN_USE")
  }
  const result = await Food.deleteOne(scopeToGym(admin, { _id: id }))
  if (result.deletedCount === 0) throw new DomainError("NOT_FOUND")
}
