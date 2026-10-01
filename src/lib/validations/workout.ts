import { z } from "zod"

import { optionalText } from "@/lib/validations/common"
import {
  calendarDateSchema,
  objectIdSchema,
  optionalNumber,
  requiredNumber,
  type NumericInput,
} from "@/lib/validations/nutrition"
import {
  EXERCISE_CATEGORIES,
  MUSCLE_GROUPS,
  WEIGHT_UNITS,
  type ExerciseCategory,
  type MuscleGroup,
  type WeightUnit,
} from "@/lib/workout/constants"

/*
 * Workout input schemas. As elsewhere, none contain gymId, userId, ownerUserId,
 * createdBy or assignedBy: unknown keys are stripped and the server derives
 * them from the authenticated context. Calendar days are always supplied by
 * the caller (browser-local "YYYY-MM-DD"); there is no server-side "today".
 */

export { calendarDateSchema, objectIdSchema }

const label = (max: number) =>
  z
    .string({ error: "Required" })
    .trim()
    .min(1, "Required")
    .max(max, `Must be at most ${max} characters`)

const optionalCalendarDate = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  calendarDateSchema.optional()
)

const booleanFlag = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean())

// ── Exercise library ─────────────────────────────────────────────────────

export const exerciseSchema = z.object({
  name: label(120),
  description: optionalText(2000),
  muscleGroup: z.enum(MUSCLE_GROUPS, { error: "Choose a muscle group" }),
  equipment: optionalText(80),
  category: z.enum(EXERCISE_CATEGORIES, { error: "Choose a category" }),
})
export interface ExerciseInput {
  name: string
  description?: string
  muscleGroup: MuscleGroup
  equipment?: string
  category: ExerciseCategory
}

// ── Plans, sessions (days) and planned exercises ─────────────────────────

export const workoutPlanSchema = z.object({
  name: label(120),
  description: optionalText(1000),
})
export type WorkoutPlanInput = z.input<typeof workoutPlanSchema>

export const workoutDaySchema = z.object({
  name: label(60),
  description: optionalText(500),
})
export type WorkoutDayInput = z.input<typeof workoutDaySchema>

export const reorderIdsSchema = z
  .array(objectIdSchema)
  .min(1, "Provide at least one id")
  .max(100)
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, "Duplicate ids")

const weightUnitSchema = z.preprocess(
  (v) => (v == null || v === "" ? "kg" : v),
  z.enum(WEIGHT_UNITS, { error: "Choose kg or lb" })
)

const plannedExerciseShape = {
  sets: requiredNumber({ positive: true, int: true, max: 20 }),
  repsMin: requiredNumber({ positive: true, int: true, max: 200 }),
  /** Upper end of a rep range ("6–8"); empty = a fixed rep count. */
  repsMax: optionalNumber({ positive: true, int: true, max: 200 }),
  targetWeight: optionalNumber({ max: 2000 }),
  weightUnit: weightUnitSchema,
  restSeconds: optionalNumber({ int: true, max: 3600 }),
  notes: optionalText(500),
}

const repsInRange = (v: { repsMin: number; repsMax: number | null }) => v.repsMax == null || v.repsMax >= v.repsMin
const repsRangeError = { message: "Max reps can't be below min reps", path: ["repsMax"] }

export const plannedExerciseConfigSchema = z.object(plannedExerciseShape).refine(repsInRange, repsRangeError)
export const addPlannedExerciseSchema = z
  .object({ exerciseId: objectIdSchema, ...plannedExerciseShape })
  .refine(repsInRange, repsRangeError)

/** Explicitly adopting a suggested target weight on one planned exercise. */
export const targetWeightSchema = z.object({
  targetWeight: requiredNumber({ positive: true, max: 2000 }),
  weightUnit: weightUnitSchema,
})
export interface TargetWeightInput {
  targetWeight: NumericInput
  weightUnit?: WeightUnit
}

export interface PlannedExerciseConfigInput {
  sets: NumericInput
  repsMin: NumericInput
  repsMax?: NumericInput
  targetWeight?: NumericInput
  weightUnit?: WeightUnit
  restSeconds?: NumericInput
  notes?: string
}
export interface AddPlannedExerciseInput extends PlannedExerciseConfigInput {
  exerciseId: string
}

// ── Assignment ───────────────────────────────────────────────────────────

export const assignWorkoutPlanSchema = z
  .object({
    workoutPlanId: objectIdSchema,
    memberId: objectIdSchema,
    /** First day of the plan, browser-local. Required. */
    startDate: calendarDateSchema,
    endDate: optionalCalendarDate,
    /** Explicit confirmation to end the member's current ACTIVE plan. */
    replaceActive: booleanFlag,
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "End date can't be before the start date",
    path: ["endDate"],
  })
export interface AssignWorkoutPlanInput {
  workoutPlanId: string
  memberId: string
  startDate: string
  endDate?: string
  replaceActive?: boolean | string
}

export const assignMyWorkoutPlanSchema = z
  .object({
    workoutPlanId: objectIdSchema,
    startDate: calendarDateSchema,
    endDate: optionalCalendarDate,
    replaceActive: booleanFlag,
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "End date can't be before the start date",
    path: ["endDate"],
  })
export interface AssignMyWorkoutPlanInput {
  workoutPlanId: string
  startDate: string
  endDate?: string
  replaceActive?: boolean | string
}

export const customizeMyWorkoutPlanSchema = z.object({ startDate: calendarDateSchema })
export interface CustomizeMyWorkoutPlanInput {
  startDate: string
}

// ── Actual workouts ──────────────────────────────────────────────────────

export const startWorkoutSchema = z.object({
  /** The member's local calendar day for this workout. Required. */
  date: calendarDateSchema,
  workoutPlanDayId: objectIdSchema,
})
export interface StartWorkoutInput {
  date: string
  workoutPlanDayId: string
}

/**
 * One performed (or pending) set. Weight is optional (bodyweight); a
 * completed set needs reps. These are ACTUAL values, independent of the plan.
 */
export const setLogSchema = z
  .object({
    weight: optionalNumber({ max: 2000 }),
    weightUnit: weightUnitSchema,
    reps: optionalNumber({ int: true, max: 1000 }),
    completed: booleanFlag,
  })
  .refine((v) => !v.completed || (v.reps != null && v.reps > 0), {
    message: "Enter the reps you did",
    path: ["reps"],
  })
export interface SetLogInput {
  weight?: NumericInput | null
  weightUnit?: WeightUnit
  reps?: NumericInput | null
  completed?: boolean
}

export const historyFilterSchema = z
  .object({
    from: optionalCalendarDate,
    to: optionalCalendarDate,
    limit: z.number().int().min(1).max(100).default(30),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "From can't be after To", path: ["from"] })
export interface HistoryFilterInput {
  from?: string
  to?: string
  limit?: number
}
