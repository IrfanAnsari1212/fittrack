import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { refField, tenantField } from "@/server/models/shared"

/**
 * A workout day/session inside a plan ("Push", "Pull", "Monday"…). Names are
 * free-form and there is no fixed weekly schedule; `order` is the sequence.
 */
const workoutPlanDaySchema = new Schema(
  {
    gymId: tenantField,
    workoutPlanId: refField("WorkoutPlan"),
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 500, default: null },
    order: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
)

workoutPlanDaySchema.index({ gymId: 1, workoutPlanId: 1, order: 1 })
workoutPlanDaySchema.plugin(tenantGuardPlugin)

export type WorkoutPlanDayDoc = InferSchemaType<typeof workoutPlanDaySchema> & { _id: Types.ObjectId }

export const WorkoutPlanDay: Model<WorkoutPlanDayDoc> =
  (models.WorkoutPlanDay as Model<WorkoutPlanDayDoc> | undefined) ??
  model<WorkoutPlanDayDoc>("WorkoutPlanDay", workoutPlanDaySchema)
