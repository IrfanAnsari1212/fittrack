import type { Types } from "mongoose"

import { sumNutrition } from "@/lib/nutrition/calculations"
import type { ServingUnit } from "@/lib/nutrition/units"
import { calendarDateSchema } from "@/lib/validations/nutrition"
import { dbReady } from "@/server/db"
import { parseInput } from "@/server/errors"
import { DailyNutritionLog } from "@/server/models/daily-nutrition-log"
import { assertWritable, scopeToTarget, type MemberTarget } from "@/server/services/nutrition/member-target"
import type { DailyNutritionLogView } from "@/types/nutrition"

/**
 * Foundation for actual consumption tracking. Module 3B adds entry
 * add/remove (using `snapshotConsumption`) and meal completion.
 */

interface LogRecord {
  _id: Types.ObjectId
  date: string
  entries: {
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
  }[]
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
