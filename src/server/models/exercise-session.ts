import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { WEIGHT_UNITS } from "@/lib/workout/constants"
import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { memberField, refField, tenantField } from "@/server/models/shared"

/**
 * One exercise within an actual workout. `planned` is a SNAPSHOT of the
 * prescription it came from (so planned vs actual can be compared later even
 * if the plan is edited); it is written once at workout start and never
 * changes. What was actually done is in SetLog.
 */
const plannedSnapshotSchema = new Schema(
  {
    sets: { type: Number, required: true },
    repsMin: { type: Number, required: true },
    repsMax: { type: Number, default: null },
    targetWeight: { type: Number, default: null },
    weightUnit: { type: String, enum: WEIGHT_UNITS, required: true },
    restSeconds: { type: Number, default: null },
    notes: { type: String, default: null },
  },
  { _id: false }
)

const exerciseSessionSchema = new Schema(
  {
    gymId: tenantField,
    userId: memberField,
    workoutSessionId: refField("WorkoutSession"),
    exerciseId: refField("Exercise"),
    /** Snapshots, so history survives exercise renames/archiving. */
    exerciseName: { type: String, required: true, maxlength: 120 },
    muscleGroup: { type: String, required: true },
    plannedExerciseId: { type: Schema.Types.ObjectId, ref: "WorkoutPlanExercise", default: null, immutable: true },
    order: { type: Number, required: true, min: 0 },
    planned: { type: plannedSnapshotSchema, required: true, immutable: true },
    /** The member marked this exercise as done (independent of set count). */
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

exerciseSessionSchema.index({ gymId: 1, userId: 1, workoutSessionId: 1, order: 1 })
// Module 5: one exercise across a member's sessions.
exerciseSessionSchema.index({ gymId: 1, userId: 1, exerciseId: 1 })
exerciseSessionSchema.plugin(tenantGuardPlugin)

export type ExerciseSessionDoc = InferSchemaType<typeof exerciseSessionSchema> & { _id: Types.ObjectId }

export const ExerciseSession: Model<ExerciseSessionDoc> =
  (models.ExerciseSession as Model<ExerciseSessionDoc> | undefined) ??
  model<ExerciseSessionDoc>("ExerciseSession", exerciseSessionSchema)
