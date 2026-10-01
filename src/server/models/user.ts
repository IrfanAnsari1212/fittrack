import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { ROLES, USER_STATUSES } from "@/lib/auth/roles"
import { tenantGuardPlugin } from "@/server/db/tenant-guard"

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    /** Globally unique: one login identity across the whole platform. */
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /** Never selected unless explicitly requested with `+passwordHash`. */
    passwordHash: { type: String, required: true, select: false },
    image: { type: String, default: null },
    role: { type: String, enum: ROLES, required: true },
    /** Tenant key. Null only for platform-level SUPER_ADMIN users. */
    gymId: {
      type: Schema.Types.ObjectId,
      ref: "Gym",
      default: null,
      required: [
        function (this: { role?: string }) {
          return this.role !== "SUPER_ADMIN"
        },
        "gymId is required for gym users",
      ],
    },
    status: { type: String, enum: USER_STATUSES, default: "ACTIVE", required: true },
    phone: { type: String, trim: true, maxlength: 30, default: null },
    dateOfBirth: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: null },
  },
  { timestamps: true }
)

userSchema.index({ gymId: 1, role: 1, createdAt: -1 })
userSchema.plugin(tenantGuardPlugin)

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId }

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc> | undefined) ?? model<UserDoc>("User", userSchema)
