import type { Types } from "mongoose"

import {
  isCompatibleUnit,
  rescaleSnapshot,
  snapshotConsumption,
  sumNutrition,
} from "@/lib/nutrition/calculations"
import type { ServingUnit } from "@/lib/nutrition/units"
import {
  calendarDateSchema,
  consumedQuantitySchema,
  logConsumptionSchema,
  objectIdSchema,
  type ConsumedQuantityInput,
  type LogConsumptionInput,
} from "@/lib/validations/nutrition"
import { dbReady } from "@/server/db"
import { DomainError, parseInput } from "@/server/errors"
import { DailyNutritionLog } from "@/server/models/daily-nutrition-log"
import { Food } from "@/server/models/food"
import { scopeToGym } from "@/server/tenant"
import { getDietPlanForDate } from "@/server/services/nutrition/assignment-service"
import type { FoodRecord } from "@/server/services/nutrition/food-service"
import { assertWritable, scopeToTarget, type MemberTarget } from "@/server/services/nutrition/member-target"
import type { DailyNutritionLogView } from "@/types/nutrition"

/**
 * ACTUAL nutrition: what a member really ate on a calendar day.
 *
 * - `date` is always a caller-supplied "YYYY-MM-DD" in the member's timezone.
 * - Entries are SNAPSHOTS (`snapshotConsumption`): name and nutrition are
 *   copied at logging time, so editing/archiving a Food never changes history.
 * - Planned nutrition is never copied here automatically; entries exist only
 *   because the member logged them. `dietPlanMealId` merely links an entry to
 *   the planned meal it was eaten for (the meal checklist is derived from it).
 */

const MAX_ENTRIES_PER_DAY = 200

interface EntryRecord {
  _id: Types.ObjectId
  foodId?: Types.ObjectId | null
  dietPlanMealId?: Types.ObjectId | null
  name: string
  quantity: number
  unit: ServingUnit
  calories: number
  protein: number
  carbs?: number | null
  fat?: number | null
  loggedAt: Date
}

interface LogRecord {
  _id: Types.ObjectId
  date: string
  entries: EntryRecord[]
}

function toView(log: LogRecord): DailyNutritionLogView {
  const entries = log.entries.map((e) => ({
    id: e._id.toString(),
    foodId: e.foodId?.toString() ?? null,
    dietPlanMealId: e.dietPlanMealId?.toString() ?? null,
    name: e.name,
    quantity: e.quantity,
    unit: e.unit,
    calories: e.calories,
    protein: e.protein,
    carbs: e.carbs ?? null,
    fat: e.fat ?? null,
    loggedAt: e.loggedAt.toISOString(),
  }))
  return { id: log._id.toString(), date: log.date, entries, totals: sumNutrition(entries) }
}

export async function getDailyNutritionLog(
  target: MemberTarget,
  date: string
): Promise<DailyNutritionLogView | null> {
  const day = parseInput(calendarDateSchema, date)
  await dbReady()
  const log = await DailyNutritionLog.findOne(scopeToTarget(target, { date: day })).lean<LogRecord>()
  return log ? toView(log) : null
}

/** Idempotent: returns the day's log, creating an empty one if needed. */
export async function getOrCreateDailyNutritionLog(
  target: MemberTarget,
  date: string
): Promise<DailyNutritionLogView> {
  assertWritable(target)
  const day = parseInput(calendarDateSchema, date)
  await dbReady()
  const log = await DailyNutritionLog.findOneAndUpdate(
    scopeToTarget(target, { date: day }),
    { $setOnInsert: { entries: [] } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean<LogRecord>()
  return toView(log!)
}

/**
 * Record foods actually eaten on `date`. Foods must be in the member's own
 * gym library and ACTIVE — except an archived food may still be logged for a
 * planned meal that contains it (the member's plan for that day).
 */
export async function logConsumption(
  target: MemberTarget,
  date: string,
  input: LogConsumptionInput
): Promise<DailyNutritionLogView> {
  assertWritable(target)
  const day = parseInput(calendarDateSchema, date)
  const data = parseInput(logConsumptionSchema, input)
  await dbReady()

  // A meal link must point at a meal of the member's own plan for that day.
  let plannedFoodIds = new Set<string>()
  if (data.dietPlanMealId) {
    const forDay = await getDietPlanForDate(target, day)
    const meal = forDay?.plan.meals.find((m) => m.id === data.dietPlanMealId?.toLowerCase())
    if (!meal) throw new DomainError("NOT_FOUND")
    plannedFoodIds = new Set(meal.foods.map((f) => f.foodId))
  }

  const foodIds = [...new Set(data.items.map((i) => i.foodId.toLowerCase()))]
  const foods = await Food.find(scopeToGym({ gymId: target.gymId }, { _id: { $in: foodIds } })).lean<FoodRecord[]>()
  const foodById = new Map(foods.map((f) => [f._id.toString(), f]))

  const now = new Date() // a timestamp of when it was logged, not a calendar day
  const entries = data.items.map((item) => {
    const food = foodById.get(item.foodId.toLowerCase())
    if (!food) throw new DomainError("NOT_FOUND")
    if (food.status !== "ACTIVE" && !plannedFoodIds.has(food._id.toString())) {
      throw new DomainError("FOOD_ARCHIVED")
    }
    if (!isCompatibleUnit(food, item.unit)) throw new DomainError("UNIT_MISMATCH")
    return {
      foodId: food._id,
      dietPlanMealId: data.dietPlanMealId ?? null,
      ...snapshotConsumption(food, item.quantity, item.unit),
      loggedAt: now,
    }
  })

  const existing = await DailyNutritionLog.findOne(scopeToTarget(target, { date: day }))
    .select("entries._id")
    .lean<{ entries: unknown[] }>()
  if ((existing?.entries.length ?? 0) + entries.length > MAX_ENTRIES_PER_DAY) {
    throw new DomainError("CONFLICT", "Daily entry limit reached")
  }

  const log = await DailyNutritionLog.findOneAndUpdate(
    scopeToTarget(target, { date: day }),
    { $push: { entries: { $each: entries } } },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
  ).lean<LogRecord>()
  return toView(log!)
}

/**
 * Change the quantity of a logged entry. The nutrition is rescaled from the
 * entry's own snapshot (same unit), never re-read from the current Food.
 */
export async function updateConsumedEntry(
  target: MemberTarget,
  date: string,
  entryId: string,
  input: ConsumedQuantityInput
): Promise<DailyNutritionLogView> {
  assertWritable(target)
  const day = parseInput(calendarDateSchema, date)
  const id = parseInput(objectIdSchema, entryId)
  const { quantity } = parseInput(consumedQuantitySchema, input)
  await dbReady()

  const log = await DailyNutritionLog.findOne(scopeToTarget(target, { date: day, "entries._id": id }))
    .select({ "entries.$": 1 })
    .lean<{ entries: EntryRecord[] }>()
  const entry = log?.entries[0]
  if (!entry) throw new DomainError("NOT_FOUND")

  const scaled = rescaleSnapshot(
    {
      quantity: entry.quantity,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs ?? null,
      fat: entry.fat ?? null,
    },
    quantity
  )
  const updated = await DailyNutritionLog.findOneAndUpdate(
    scopeToTarget(target, { date: day, "entries._id": id }),
    {
      $set: {
        "entries.$.quantity": quantity,
        "entries.$.calories": scaled.calories,
        "entries.$.protein": scaled.protein,
        "entries.$.carbs": scaled.carbs,
        "entries.$.fat": scaled.fat,
      },
    },
    { returnDocument: "after", runValidators: true }
  ).lean<LogRecord>()
  if (!updated) throw new DomainError("NOT_FOUND")
  return toView(updated)
}

export async function removeConsumedEntry(
  target: MemberTarget,
  date: string,
  entryId: string
): Promise<DailyNutritionLogView> {
  assertWritable(target)
  const day = parseInput(calendarDateSchema, date)
  const id = parseInput(objectIdSchema, entryId)
  await dbReady()
  const updated = await DailyNutritionLog.findOneAndUpdate(
    scopeToTarget(target, { date: day, "entries._id": id }),
    { $pull: { entries: { _id: id } } },
    { returnDocument: "after" }
  ).lean<LogRecord>()
  if (!updated) throw new DomainError("NOT_FOUND")
  return toView(updated)
}
