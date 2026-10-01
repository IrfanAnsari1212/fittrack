import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { refField, tenantField } from "@/server/models/shared"

export const DIET_PLAN_STATUSES = ["ACTIVE", "ARCHIVED"] as const

const dietPlanSchema = new Schema(
  {
    gymId: tenantField,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: null },
    /** Who created it (from the session, never the client). */
    createdBy: refField("User"),
    /**
     * null → a GYM plan: the admin's shared library, assignable to members.
     * set  → a PERSONAL plan owned by that member; only they can edit it,
     *        and it can only ever be assigned to them.
     */
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
    /** For a personal copy made by "customize": the gym plan it came from. */
    sourcePlanId: { type: Schema.Types.ObjectId, ref: "DietPlan", default: null, immutable: true },
    /** Archived plans are read-only and can't be newly assigned. */
    status: { type: String, enum: DIET_PLAN_STATUSES, default: "ACTIVE", required: true },
  },
  { timestamps: true }
)

// Plan lists: a gym's library (ownerUserId null) or one member's personal
// plans, filtered by status, most recently edited first.
dietPlanSchema.index({ gymId: 1, ownerUserId: 1, status: 1, updatedAt: -1 })
dietPlanSchema.plugin(tenantGuardPlugin)

export type DietPlanDoc = InferSchemaType<typeof dietPlanSchema> & { _id: Types.ObjectId }

export const DietPlan: Model<DietPlanDoc> =
  (models.DietPlan as Model<DietPlanDoc> | undefined) ?? model<DietPlanDoc>("DietPlan", dietPlanSchema)
