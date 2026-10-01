import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { EXERCISE_CATEGORIES, MUSCLE_GROUPS } from "@/lib/workout/constants"
import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { tenantField } from "@/server/models/shared"

export const EXERCISE_STATUSES = ["ACTIVE", "ARCHIVED"] as const

/**
 * A gym's reusable exercise definition. Plans reference exercises by id;
 * workout sessions snapshot the name/muscle group when a workout starts.
 */
const exerciseSchema = new Schema(
  {
    gymId: tenantField,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: null },
    muscleGroup: { type: String, enum: MUSCLE_GROUPS, required: true },
    equipment: { type: String, trim: true, maxlength: 80, default: null },
    category: { type: String, enum: EXERCISE_CATEGORIES, required: true },
    /** Archived exercises stay valid for existing plans but can't be newly added. */
    status: { type: String, enum: EXERCISE_STATUSES, default: "ACTIVE", required: true },
  },
  { timestamps: true }
)

// Library listing/filtering: a gym's exercises by status, alphabetical.
exerciseSchema.index({ gymId: 1, status: 1, name: 1 })
exerciseSchema.index({ gymId: 1, muscleGroup: 1, status: 1 })
exerciseSchema.plugin(tenantGuardPlugin)

export type ExerciseDoc = InferSchemaType<typeof exerciseSchema> & { _id: Types.ObjectId }

export const Exercise: Model<ExerciseDoc> =
  (models.Exercise as Model<ExerciseDoc> | undefined) ?? model<ExerciseDoc>("Exercise", exerciseSchema)
