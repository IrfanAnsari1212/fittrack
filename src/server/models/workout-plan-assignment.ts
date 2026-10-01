import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { calendarDateField, memberField, refField, tenantField } from "@/server/models/shared"

export const WORKOUT_ASSIGNMENT_STATUSES = ["ACTIVE", "COMPLETED", "CANCELLED"] as const

/**
 * Links a workout plan to a member for a period. Kept as history (date
 * ranges are never rewritten); at most one ACTIVE assignment per member,
 * guaranteed by a partial unique index rather than application code alone.
 */
const workoutPlanAssignmentSchema = new Schema(
  {
    gymId: tenantField,
    workoutPlanId: refField("WorkoutPlan"),
    userId: memberField,
    startDate: { ...calendarDateField, required: true },
    endDate: { ...calendarDateField, default: null },
    status: { type: String, enum: WORKOUT_ASSIGNMENT_STATUSES, default: "ACTIVE", required: true },
    /** The user who assigned it (admin, or the member themselves) — from the session. */
    assignedBy: refField("User"),
  },
  { timestamps: true }
)

workoutPlanAssignmentSchema.index(
  { gymId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: "ACTIVE" }, name: "one_active_workout_assignment_per_member" }
)
workoutPlanAssignmentSchema.index({ gymId: 1, userId: 1, startDate: -1 })
workoutPlanAssignmentSchema.index({ gymId: 1, workoutPlanId: 1, status: 1 })
workoutPlanAssignmentSchema.plugin(tenantGuardPlugin)

export type WorkoutPlanAssignmentDoc = InferSchemaType<typeof workoutPlanAssignmentSchema> & { _id: Types.ObjectId }

export const WorkoutPlanAssignment: Model<WorkoutPlanAssignmentDoc> =
  (models.WorkoutPlanAssignment as Model<WorkoutPlanAssignmentDoc> | undefined) ??
  model<WorkoutPlanAssignmentDoc>("WorkoutPlanAssignment", workoutPlanAssignmentSchema)
