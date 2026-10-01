import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { calendarDateField, memberField, refField, tenantField } from "@/server/models/shared"

export const ASSIGNMENT_STATUSES = ["ACTIVE", "COMPLETED", "CANCELLED"] as const

/**
 * Links a diet plan to a member for a period. Kept as history; at most one
 * ACTIVE assignment per member (enforced by a partial unique index, not just
 * application code). Assigning a new plan completes the previous one.
 */
const dietPlanAssignmentSchema = new Schema(
  {
    gymId: tenantField,
    dietPlanId: refField("DietPlan"),
    userId: memberField,
    startDate: { ...calendarDateField, required: true },
    endDate: { ...calendarDateField, default: null },
    status: { type: String, enum: ASSIGNMENT_STATUSES, default: "ACTIVE", required: true },
    /** The Gym Admin who assigned it (from the session, never the client). */
    assignedBy: refField("User"),
  },
  { timestamps: true }
)

// Hard guarantee: one ACTIVE assignment per member.
dietPlanAssignmentSchema.index(
  { gymId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: "ACTIVE" }, name: "one_active_assignment_per_member" }
)
// A member's assignment history, newest first.
dietPlanAssignmentSchema.index({ gymId: 1, userId: 1, startDate: -1 })
// Who is on a given plan (e.g. before archiving it, admin "assigned members" lists).
dietPlanAssignmentSchema.index({ gymId: 1, dietPlanId: 1, status: 1 })
dietPlanAssignmentSchema.plugin(tenantGuardPlugin)

export type DietPlanAssignmentDoc = InferSchemaType<typeof dietPlanAssignmentSchema> & { _id: Types.ObjectId }

export const DietPlanAssignment: Model<DietPlanAssignmentDoc> =
  (models.DietPlanAssignment as Model<DietPlanAssignmentDoc> | undefined) ??
  model<DietPlanAssignmentDoc>("DietPlanAssignment", dietPlanAssignmentSchema)
