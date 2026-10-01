import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { calendarDateField, memberField, nonNegative, tenantField } from "@/server/models/shared"

/**
 * A member's daily targets. Kept as history: a new goal takes effect from
 * `effectiveFrom`, and the current goal is the latest one on or before today.
 */
const nutritionGoalSchema = new Schema(
  {
    gymId: tenantField,
    userId: memberField,
    dailyCalories: { ...nonNegative(20000), required: true },
    dailyProtein: { ...nonNegative(1000), required: true },
    dailyCarbs: { ...nonNegative(3000), default: null },
    dailyFat: { ...nonNegative(1000), default: null },
    effectiveFrom: { ...calendarDateField, required: true },
    /** Who last set it (the member or a Gym Admin). Audit only. */
    setBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
)

// Current-goal lookup: { gymId, userId, effectiveFrom ≤ today } sorted desc.
// Unique: at most one goal per member per start date (re-saving updates it).
nutritionGoalSchema.index({ gymId: 1, userId: 1, effectiveFrom: -1 }, { unique: true })
nutritionGoalSchema.plugin(tenantGuardPlugin)

export type NutritionGoalDoc = InferSchemaType<typeof nutritionGoalSchema> & { _id: Types.ObjectId }

export const NutritionGoal: Model<NutritionGoalDoc> =
  (models.NutritionGoal as Model<NutritionGoalDoc> | undefined) ??
  model<NutritionGoalDoc>("NutritionGoal", nutritionGoalSchema)
