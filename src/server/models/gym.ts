import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { GYM_STATUSES } from "@/lib/auth/roles"

export const SUBSCRIPTION_PLANS = ["TRIAL", "BASIC", "PRO"] as const
export const SUBSCRIPTION_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"] as const

/**
 * Billing placeholder. Payment-provider fields (customer id, price id, …)
 * get added here when billing is implemented.
 */
const subscriptionSchema = new Schema(
  {
    plan: { type: String, enum: SUBSCRIPTION_PLANS, default: "TRIAL", required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: "TRIALING", required: true },
    startDate: { type: Date, default: () => new Date() },
    endDate: { type: Date, default: null },
  },
  { _id: false }
)

/**
 * A gym is the tenant boundary. It is NOT itself tenant-guarded: gym-level
 * queries are scoped by `_id` (the caller's gymId) in the services.
 */
const gymSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    logoUrl: { type: String, default: null },
    /** Primary owner/admin. Other admins are linked via User.gymId + role. */
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: GYM_STATUSES, default: "ACTIVE", required: true },
    subscription: { type: subscriptionSchema, default: () => ({}) },
  },
  { timestamps: true }
)

export type GymDoc = InferSchemaType<typeof gymSchema> & { _id: Types.ObjectId }

export const Gym: Model<GymDoc> =
  (models.Gym as Model<GymDoc> | undefined) ?? model<GymDoc>("Gym", gymSchema)
