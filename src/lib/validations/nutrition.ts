import { z } from "zod"

import { isCalendarDate } from "@/lib/nutrition/calendar-date"
import { SERVING_UNITS, type ServingUnit } from "@/lib/nutrition/units"

/*
 * Nutrition input schemas. Like Module 2, none of them contain gymId,
 * userId, createdBy or assignedBy: unknown keys are stripped, and the server
 * derives those values from the authenticated context.
 *
 * Numeric fields accept numbers or numeric strings (FormData) — but an empty
 * string is "missing", never 0.
 */

/** Numbers, or numeric strings straight from FormData. */
export type NumericInput = number | string

const toNumber = (value: unknown) => {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  return trimmed === "" ? undefined : Number(trimmed)
}

interface NumberRule {
  max: number
  /** Require > 0 instead of ≥ 0. */
  positive?: boolean
  int?: boolean
}

function numberSchema({ max, positive, int }: NumberRule) {
  let schema = z.number({ error: "Enter a number" })
  if (int) schema = schema.int("Must be a whole number")
  schema = positive
    ? schema.positive("Must be greater than 0")
    : schema.min(0, "Can't be negative")
  return schema.max(max, `Must be at most ${max}`)
}

export function requiredNumber(rule: NumberRule) {
  return z.preprocess(toNumber, numberSchema(rule))
}

/** Optional number: missing/empty → null. */
export function optionalNumber(rule: NumberRule) {
  return z.preprocess(
    (value) => toNumber(value) ?? null,
    numberSchema(rule).nullable()
  )
}

export const objectIdSchema = z
  .string({ error: "Invalid id" })
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Invalid id")

/**
 * A user-facing calendar day, "YYYY-MM-DD". Always supplied by the caller in
 * the relevant user/gym timezone — the server never derives "today" itself
 * (its UTC clock can be a day off from the member around midnight).
 */
export const calendarDateSchema = z
  .string({ error: "Enter a date" })
  .trim()
  .refine(isCalendarDate, "Enter a valid date (YYYY-MM-DD)")

const optionalCalendarDate = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  calendarDateSchema.optional()
)

/** 24h "HH:mm", e.g. "08:00", "20:30". */
export const mealTimeSchema = z
  .string({ error: "Enter a time" })
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time as HH:mm (24h)")

export const servingUnitSchema = z.enum(SERVING_UNITS, { error: "Choose a valid unit" })

const label = (max: number) =>
  z.string({ error: "Required" }).trim().min(1, "Required").max(max, `Must be at most ${max} characters`)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .nullable()
    .transform((value) => value || null)

// ── Goals ────────────────────────────────────────────────────────────────

export const nutritionGoalSchema = z.object({
  dailyCalories: requiredNumber({ positive: true, int: true, max: 20000 }),
  dailyProtein: requiredNumber({ max: 1000 }),
  dailyCarbs: optionalNumber({ max: 3000 }),
  dailyFat: optionalNumber({ max: 1000 }),
  /** First day the goal applies, in the member's timezone. Required. */
  effectiveFrom: calendarDateSchema,
})
export interface NutritionGoalInput {
  dailyCalories: NumericInput
  dailyProtein: NumericInput
  dailyCarbs?: NumericInput | null
  dailyFat?: NumericInput | null
  /** "YYYY-MM-DD" in the member's timezone. */
  effectiveFrom: string
}

/** Updating a goal by id: omitting effectiveFrom keeps the stored date. */
export const nutritionGoalUpdateSchema = nutritionGoalSchema.extend({
  effectiveFrom: optionalCalendarDate,
})
export type NutritionGoalUpdateInput = Omit<NutritionGoalInput, "effectiveFrom"> & {
  effectiveFrom?: string
}

// ── Foods ────────────────────────────────────────────────────────────────

export const foodSchema = z.object({
  name: label(120),
  servingSize: requiredNumber({ positive: true, max: 10000 }),
  servingUnit: servingUnitSchema,
  calories: requiredNumber({ max: 10000 }),
  protein: requiredNumber({ max: 1000 }),
  carbs: optionalNumber({ max: 1000 }),
  fat: optionalNumber({ max: 1000 }),
})
export interface FoodInput {
  name: string
  servingSize: NumericInput
  servingUnit: ServingUnit
  calories: NumericInput
  protein: NumericInput
  carbs?: NumericInput | null
  fat?: NumericInput | null
}

// ── Diet plans ───────────────────────────────────────────────────────────

export const dietPlanSchema = z.object({
  name: label(120),
  description: optionalText(1000),
})
export type DietPlanInput = z.input<typeof dietPlanSchema>

export const dietPlanMealSchema = z.object({
  name: label(60),
  time: mealTimeSchema,
})
export type DietPlanMealInput = z.input<typeof dietPlanMealSchema>

export const reorderMealsSchema = z
  .array(objectIdSchema)
  .min(1, "Provide at least one meal")
  .max(50)
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, "Duplicate meal ids")

export const mealFoodQuantitySchema = z.object({
  quantity: requiredNumber({ positive: true, max: 100000 }),
  unit: servingUnitSchema,
})
export interface MealFoodQuantityInput {
  quantity: NumericInput
  unit: ServingUnit
}

export const mealFoodSchema = mealFoodQuantitySchema.extend({ foodId: objectIdSchema })
export interface MealFoodInput extends MealFoodQuantityInput {
  foodId: string
}

// ── Assignments ──────────────────────────────────────────────────────────

export const assignDietPlanSchema = z
  .object({
    dietPlanId: objectIdSchema,
    memberId: objectIdSchema,
    /** First day of the plan, in the gym/member timezone. Required. */
    startDate: calendarDateSchema,
    endDate: optionalCalendarDate,
    /**
     * Explicit confirmation to end the member's current ACTIVE plan and
     * assign this one in the same transaction. Without it, assigning to a
     * member who already has an active plan is rejected.
     */
    replaceActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "End date can't be before the start date",
    path: ["endDate"],
  })
export interface AssignDietPlanInput {
  dietPlanId: string
  memberId: string
  /** "YYYY-MM-DD" in the gym/member timezone. */
  startDate: string
  endDate?: string
  replaceActive?: boolean | string
}

export const endAssignmentSchema = z.object({
  /** The day the assignment ends — the admin's "today" in the gym timezone. Required. */
  endDate: calendarDateSchema,
  status: z.enum(["COMPLETED", "CANCELLED"], { error: "Choose COMPLETED or CANCELLED" }),
})
export type EndAssignmentInput = z.input<typeof endAssignmentSchema>

// ── Actual consumption (daily log entries) ───────────────────────────────

export const consumedItemSchema = z.object({
  foodId: objectIdSchema,
  quantity: requiredNumber({ positive: true, max: 100000 }),
  unit: servingUnitSchema,
})

/**
 * Log one or more foods actually eaten on a day. `dietPlanMealId` optionally
 * links the entries to a planned meal (used to derive the meal checklist);
 * the server verifies it belongs to the member's plan for that day.
 */
export const logConsumptionSchema = z.object({
  dietPlanMealId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    objectIdSchema.optional()
  ),
  items: z.array(consumedItemSchema).min(1, "Add at least one food").max(30, "Too many foods at once"),
})
export interface LogConsumptionInput {
  dietPlanMealId?: string
  items: { foodId: string; quantity: NumericInput; unit: ServingUnit }[]
}

/** Editing a logged entry: quantity only, in the entry's original unit. */
export const consumedQuantitySchema = z.object({
  quantity: requiredNumber({ positive: true, max: 100000 }),
})
export interface ConsumedQuantityInput {
  quantity: NumericInput
}

// ── Member-owned diets ───────────────────────────────────────────────────

/** A member switching to one of their OWN personal plans (no memberId: it's always themselves). */
export const assignMyDietPlanSchema = z
  .object({
    dietPlanId: objectIdSchema,
    /** First day, in the member's local timezone. Required. */
    startDate: calendarDateSchema,
    endDate: optionalCalendarDate,
    replaceActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "End date can't be before the start date",
    path: ["endDate"],
  })
export interface AssignMyDietPlanInput {
  dietPlanId: string
  startDate: string
  endDate?: string
  replaceActive?: boolean | string
}

/** "Customize my plan": copy the current gym plan into a personal plan from this day. */
export const customizeMyDietPlanSchema = z.object({
  /** The member's local day the personal copy takes over. Required. */
  startDate: calendarDateSchema,
})
export interface CustomizeMyDietPlanInput {
  startDate: string
}
