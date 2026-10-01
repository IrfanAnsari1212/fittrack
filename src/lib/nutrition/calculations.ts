import type { ServingUnit } from "@/lib/nutrition/units"

/**
 * Pure nutrition math, shared by server services and (later) UI previews.
 * No database or React code here so it stays trivially testable.
 *
 * Model: a Food defines values per serving (e.g. 100 g of rice). A quantity
 * is either in the food's own unit (200 g → 2 servings) or in "serving"s.
 */

export interface FoodNutrition {
  servingSize: number
  servingUnit: ServingUnit
  calories: number
  protein: number
  carbs?: number | null
  fat?: number | null
}

export interface NutritionTotals {
  calories: number
  protein: number
  /** Null when no contributing food defines it. */
  carbs: number | null
  fat: number | null
}

export const ZERO_NUTRITION: NutritionTotals = { calories: 0, protein: 0, carbs: null, fat: null }

export class UnitMismatchError extends Error {
  constructor(foodUnit: ServingUnit, unit: ServingUnit) {
    super(`Quantity unit "${unit}" doesn't match the food's unit "${foodUnit}" (or "serving").`)
    this.name = "UnitMismatchError"
  }
}

const round1 = (value: number) => Math.round(value * 10) / 10

/** A quantity must be in the food's unit or in whole servings. */
export function isCompatibleUnit(food: Pick<FoodNutrition, "servingUnit">, unit: ServingUnit) {
  return unit === "serving" || unit === food.servingUnit
}

/** How many servings `quantity unit` of this food is. */
export function servingsFor(
  food: Pick<FoodNutrition, "servingSize" | "servingUnit">,
  quantity: number,
  unit: ServingUnit
): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError("Quantity must be a non-negative number")
  }
  if (unit === "serving") return quantity
  if (unit !== food.servingUnit) throw new UnitMismatchError(food.servingUnit, unit)
  if (!(food.servingSize > 0)) throw new RangeError("Serving size must be greater than 0")
  return quantity / food.servingSize
}

/** Nutrition for `quantity unit` of a food: per-serving value × servings. */
export function nutritionFor(food: FoodNutrition, quantity: number, unit: ServingUnit): NutritionTotals {
  const servings = servingsFor(food, quantity, unit)
  return {
    calories: round1(food.calories * servings),
    protein: round1(food.protein * servings),
    carbs: food.carbs == null ? null : round1(food.carbs * servings),
    fat: food.fat == null ? null : round1(food.fat * servings),
  }
}

/** Sum totals; optional macros stay null only if no item defines them. */
export function sumNutrition(items: readonly NutritionTotals[]): NutritionTotals {
  const optional = (key: "carbs" | "fat") => {
    const known = items.map((item) => item[key]).filter((v): v is number => v != null)
    return known.length ? round1(known.reduce((a, b) => a + b, 0)) : null
  }
  return {
    calories: round1(items.reduce((sum, item) => sum + item.calories, 0)),
    protein: round1(items.reduce((sum, item) => sum + item.protein, 0)),
    carbs: optional("carbs"),
    fat: optional("fat"),
  }
}

/**
 * Freeze what was eaten at logging time (Module 3B). The log keeps these
 * numbers even if the Food is later edited or archived, so history never
 * changes retroactively.
 */
export function snapshotConsumption(
  food: FoodNutrition & { name: string },
  quantity: number,
  unit: ServingUnit
) {
  return {
    name: food.name,
    quantity,
    unit,
    ...nutritionFor(food, quantity, unit),
  }
}

/**
 * Rescale an already-snapshotted entry to a new quantity (same unit).
 * Uses only the entry's own stored values — never the current Food — so
 * editing a logged quantity can't pull in later changes to the food.
 */
export function rescaleSnapshot(
  snapshot: NutritionTotals & { quantity: number },
  newQuantity: number
): NutritionTotals {
  if (!(snapshot.quantity > 0)) throw new RangeError("Snapshot quantity must be greater than 0")
  if (!Number.isFinite(newQuantity) || newQuantity < 0) {
    throw new RangeError("Quantity must be a non-negative number")
  }
  const factor = newQuantity / snapshot.quantity
  return {
    calories: round1(snapshot.calories * factor),
    protein: round1(snapshot.protein * factor),
    carbs: snapshot.carbs == null ? null : round1(snapshot.carbs * factor),
    fat: snapshot.fat == null ? null : round1(snapshot.fat * factor),
  }
}

export interface GoalProgress {
  consumed: number
  target: number
  /** Never negative. */
  remaining: number
  /** How far above target (0 when at/below). */
  over: number
  /** 0–100, capped (for progress bars). */
  percent: number
}

/** Actual consumption vs. a daily target, without negative "remaining". */
export function progressToward(consumed: number, target: number): GoalProgress {
  const round = (v: number) => Math.round(v * 10) / 10
  return {
    consumed: round(consumed),
    target,
    remaining: round(Math.max(0, target - consumed)),
    over: round(Math.max(0, consumed - target)),
    percent: target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0,
  }
}
