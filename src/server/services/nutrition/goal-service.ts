import type { Types } from "mongoose"

import {
  calendarDateSchema,
  nutritionGoalSchema,
  nutritionGoalUpdateSchema,
  objectIdSchema,
  type NutritionGoalInput,
  type NutritionGoalUpdateInput,
} from "@/lib/validations/nutrition"
import { dbReady } from "@/server/db"
import { DomainError, parseInput } from "@/server/errors"
import { NutritionGoal } from "@/server/models/nutrition-goal"
import { assertWritable, scopeToTarget, type MemberTarget } from "@/server/services/nutrition/member-target"
import type { SessionUser } from "@/types/auth"
import type { NutritionGoalView } from "@/types/nutrition"

interface GoalRecord {
  _id: Types.ObjectId
  dailyCalories: number
  dailyProtein: number
  dailyCarbs?: number | null
  dailyFat?: number | null
  effectiveFrom: string
  updatedAt: Date
}

function toView(goal: GoalRecord): NutritionGoalView {
  return {
    id: goal._id.toString(),
    dailyCalories: goal.dailyCalories,
    dailyProtein: goal.dailyProtein,
    dailyCarbs: goal.dailyCarbs ?? null,
    dailyFat: goal.dailyFat ?? null,
    effectiveFrom: goal.effectiveFrom,
    updatedAt: goal.updatedAt.toISOString(),
  }
}

/*
 * Calendar dates (`asOf`, `effectiveFrom`) are REQUIRED and must be supplied
 * by the caller as "YYYY-MM-DD" in the member's timezone. The server never
 * falls back to its own (UTC) clock, which can be a day off around midnight
 * and would silently store the wrong day.
 */

/** The goal in effect on `asOf`: latest effectiveFrom ≤ asOf. */
export async function getCurrentNutritionGoal(
  target: MemberTarget,
  asOf: string
): Promise<NutritionGoalView | null> {
  const day = parseInput(calendarDateSchema, asOf)
  await dbReady()
  const goal = await NutritionGoal.findOne(scopeToTarget(target, { effectiveFrom: { $lte: day } }))
    .sort({ effectiveFrom: -1 })
    .lean<GoalRecord>()
  return goal ? toView(goal) : null
}

export async function listNutritionGoals(target: MemberTarget): Promise<NutritionGoalView[]> {
  await dbReady()
  const goals = await NutritionGoal.find(scopeToTarget(target))
    .sort({ effectiveFrom: -1 })
    .limit(100)
    .lean<GoalRecord[]>()
  return goals.map(toView)
}

/**
 * Create the goal starting `input.effectiveFrom` (required), or update the
 * goal that already starts that day. `actor` is recorded as `setBy`.
 */
export async function setNutritionGoal(
  target: MemberTarget,
  actor: Pick<SessionUser, "id">,
  input: NutritionGoalInput
): Promise<NutritionGoalView> {
  assertWritable(target)
  const data = parseInput(nutritionGoalSchema, input)
  const { effectiveFrom } = data
  await dbReady()
  const goal = await NutritionGoal.findOneAndUpdate(
    scopeToTarget(target, { effectiveFrom }),
    {
      $set: {
        dailyCalories: data.dailyCalories,
        dailyProtein: data.dailyProtein,
        dailyCarbs: data.dailyCarbs,
        dailyFat: data.dailyFat,
        setBy: actor.id,
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
  ).lean<GoalRecord>()
  return toView(goal!)
}

/**
 * Update an existing goal by id (only if it belongs to the target).
 * Omitting `effectiveFrom` keeps the stored date; it is never re-derived.
 */
export async function updateNutritionGoal(
  target: MemberTarget,
  actor: Pick<SessionUser, "id">,
  goalId: string,
  input: NutritionGoalUpdateInput
): Promise<NutritionGoalView> {
  assertWritable(target)
  const id = parseInput(objectIdSchema, goalId)
  const data = parseInput(nutritionGoalUpdateSchema, input)
  await dbReady()
  const update: Record<string, unknown> = {
    dailyCalories: data.dailyCalories,
    dailyProtein: data.dailyProtein,
    dailyCarbs: data.dailyCarbs,
    dailyFat: data.dailyFat,
    setBy: actor.id,
  }
  if (data.effectiveFrom) update.effectiveFrom = data.effectiveFrom
  try {
    const goal = await NutritionGoal.findOneAndUpdate(
      scopeToTarget(target, { _id: id }),
      { $set: update },
      { returnDocument: "after", runValidators: true }
    ).lean<GoalRecord>()
    if (!goal) throw new DomainError("NOT_FOUND")
    return toView(goal)
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      throw new DomainError("CONFLICT", "Another goal already starts on that date")
    }
    throw error
  }
}
