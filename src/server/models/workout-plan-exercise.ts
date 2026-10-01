import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { WEIGHT_UNITS } from "@/lib/workout/constants"
import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { refField, tenantField } from "@/server/models/shared"

/**
 * A PLANNED exercise inside a workout day: a reference to Exercise plus the
 * target prescription. It describes what should be done — what actually
 * happened lives in ExerciseSession/SetLog and never changes this record.
 * `workoutPlanId` is denormalized from the day (server-side) so a whole plan
 * loads in one query.
 */
const workoutPlanExerciseSchema = new Schema(
  {
    gymId: tenantField,
    workoutPlanId: refField("WorkoutPlan"),
    workoutPlanDayId: refField("WorkoutPlanDay"),
    exerciseId: refField("Exercise"),
    order: { type: Number, required: true, min: 0 },
    sets: { type: Number, required: true, min: 1, max: 20 },
    repsMin: { type: Number, required: true, min: 1, max: 200 },
    /** Upper end of a rep range; null = a fixed `repsMin`. */
    repsMax: { type: Number, min: 1, max: 200, default: null },
    targetWeight: { type: Number, min: 0, max: 2000, default: null },
    weightUnit: { type: String, enum: WEIGHT_UNITS, default: "kg", required: true },
    restSeconds: { type: Number, min: 0, max: 3600, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true }
)

workoutPlanExerciseSchema.index({ gymId: 1, workoutPlanId: 1, workoutPlanDayId: 1, order: 1 })
// "Is this exercise used by any plan?"
workoutPlanExerciseSchema.index({ gymId: 1, exerciseId: 1 })
workoutPlanExerciseSchema.plugin(tenantGuardPlugin)

export type WorkoutPlanExerciseDoc = InferSchemaType<typeof workoutPlanExerciseSchema> & { _id: Types.ObjectId }

export const WorkoutPlanExercise: Model<WorkoutPlanExerciseDoc> =
  (models.WorkoutPlanExercise as Model<WorkoutPlanExerciseDoc> | undefined) ??
  model<WorkoutPlanExerciseDoc>("WorkoutPlanExercise", workoutPlanExerciseSchema)
