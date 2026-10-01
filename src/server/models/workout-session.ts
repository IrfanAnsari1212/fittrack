import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { SESSION_STATUSES } from "@/lib/workout/constants"
import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { calendarDateField, memberField, refField, tenantField } from "@/server/models/shared"

/**
 * An ACTUAL workout a member did (or is doing). It records what happened;
 * it never edits the plan it was started from. Plan and day names are
 * snapshotted so history stays readable if the plan later changes.
 *
 * `date` is the member's local calendar day ("YYYY-MM-DD", from the
 * browser). `startedAt`/`completedAt` are real instants.
 */
const workoutSessionSchema = new Schema(
  {
    gymId: tenantField,
    userId: memberField,
    date: { ...calendarDateField, required: true },
    workoutPlanId: refField("WorkoutPlan"),
    workoutPlanDayId: refField("WorkoutPlanDay"),
    planName: { type: String, required: true, maxlength: 120 },
    dayName: { type: String, required: true, maxlength: 60 },
    status: { type: String, enum: SESSION_STATUSES, default: "IN_PROGRESS", required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    durationSeconds: { type: Number, min: 0, default: null },
  },
  { timestamps: true }
)

// History: a member's sessions, newest day first.
workoutSessionSchema.index({ gymId: 1, userId: 1, date: -1, startedAt: -1 })
// "Which day comes next in this plan?"
workoutSessionSchema.index({ gymId: 1, userId: 1, workoutPlanId: 1, status: 1, startedAt: -1 })
// Hard guarantee: one workout in progress per member.
workoutSessionSchema.index(
  { gymId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: "IN_PROGRESS" }, name: "one_in_progress_session_per_member" }
)
workoutSessionSchema.plugin(tenantGuardPlugin)

export type WorkoutSessionDoc = InferSchemaType<typeof workoutSessionSchema> & { _id: Types.ObjectId }

export const WorkoutSession: Model<WorkoutSessionDoc> =
  (models.WorkoutSession as Model<WorkoutSessionDoc> | undefined) ??
  model<WorkoutSessionDoc>("WorkoutSession", workoutSessionSchema)
