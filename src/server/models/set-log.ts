import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { WEIGHT_UNITS } from "@/lib/workout/constants"
import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { calendarDateField, memberField, refField, tenantField } from "@/server/models/shared"

/**
 * One ACTUAL set. Weight and reps are what the member did, independent of
 * the plan (85 kg × 6 against a planned 80 kg × 8 is valid). Rows exist
 * unfilled (completed=false) while a workout is in progress; unfinished
 * rows are dropped when the workout is finished, so history holds only
 * performed sets. `date`/`exerciseId` are denormalized for cross-session
 * queries (Module 5).
 */
const setLogSchema = new Schema(
  {
    gymId: tenantField,
    userId: memberField,
    workoutSessionId: refField("WorkoutSession"),
    exerciseSessionId: refField("ExerciseSession"),
    exerciseId: refField("Exercise"),
    date: { ...calendarDateField, required: true, immutable: true },
    setNumber: { type: Number, required: true, min: 1 },
    weight: { type: Number, min: 0, max: 2000, default: null },
    weightUnit: { type: String, enum: WEIGHT_UNITS, default: "kg", required: true },
    reps: { type: Number, min: 0, max: 1000, default: null },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

setLogSchema.index({ gymId: 1, userId: 1, exerciseSessionId: 1, setNumber: 1 })
setLogSchema.index({ gymId: 1, userId: 1, workoutSessionId: 1 })
setLogSchema.index({ gymId: 1, userId: 1, exerciseId: 1, date: -1 })
setLogSchema.plugin(tenantGuardPlugin)

export type SetLogDoc = InferSchemaType<typeof setLogSchema> & { _id: Types.ObjectId }

export const SetLog: Model<SetLogDoc> =
  (models.SetLog as Model<SetLogDoc> | undefined) ?? model<SetLogDoc>("SetLog", setLogSchema)
