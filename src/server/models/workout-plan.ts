import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { refField, tenantField } from "@/server/models/shared"

export const WORKOUT_PLAN_STATUSES = ["ACTIVE", "ARCHIVED"] as const

/**
 * Planned training. Same ownership semantics as DietPlan:
 *  - ownerUserId null → a GYM plan (admin library, assignable to members)
 *  - ownerUserId set  → that member's PERSONAL plan (only they edit it, and it
 *    can only ever be assigned to them)
 */
const workoutPlanSchema = new Schema(
  {
    gymId: tenantField,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: null },
    /** Who created it (from the session, never the client). */
    createdBy: refField("User"),
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
    /** For a personal copy made by "customize": the gym plan it came from. */
    sourcePlanId: { type: Schema.Types.ObjectId, ref: "WorkoutPlan", default: null, immutable: true },
    /** Archived plans are read-only and can't be newly assigned. */
    status: { type: String, enum: WORKOUT_PLAN_STATUSES, default: "ACTIVE", required: true },
  },
  { timestamps: true }
)

workoutPlanSchema.index({ gymId: 1, ownerUserId: 1, status: 1, updatedAt: -1 })
// "Does this member already have a personal copy of that gym plan?"
workoutPlanSchema.index({ gymId: 1, ownerUserId: 1, sourcePlanId: 1 })
workoutPlanSchema.plugin(tenantGuardPlugin)

export type WorkoutPlanDoc = InferSchemaType<typeof workoutPlanSchema> & { _id: Types.ObjectId }

export const WorkoutPlan: Model<WorkoutPlanDoc> =
  (models.WorkoutPlan as Model<WorkoutPlanDoc> | undefined) ?? model<WorkoutPlanDoc>("WorkoutPlan", workoutPlanSchema)
