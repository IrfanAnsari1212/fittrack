import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { refField, tenantField } from "@/server/models/shared"

export const DIET_PLAN_STATUSES = ["ACTIVE", "ARCHIVED"] as const

const dietPlanSchema = new Schema(
  {
    gymId: tenantField,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: null },
    /** The Gym Admin who created it (from the session, never the client). */
    createdBy: refField("User"),
    /** Archived plans are read-only and can't be newly assigned. */
    status: { type: String, enum: DIET_PLAN_STATUSES, default: "ACTIVE", required: true },
  },
  { timestamps: true }
)

// Admin plan list: a gym's plans filtered by status, most recently edited first.
dietPlanSchema.index({ gymId: 1, status: 1, updatedAt: -1 })
dietPlanSchema.plugin(tenantGuardPlugin)

export type DietPlanDoc = InferSchemaType<typeof dietPlanSchema> & { _id: Types.ObjectId }

export const DietPlan: Model<DietPlanDoc> =
  (models.DietPlan as Model<DietPlanDoc> | undefined) ?? model<DietPlanDoc>("DietPlan", dietPlanSchema)
