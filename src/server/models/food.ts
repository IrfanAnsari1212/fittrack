import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { nonNegative, servingUnitField, tenantField } from "@/server/models/shared"

export const FOOD_STATUSES = ["ACTIVE", "ARCHIVED"] as const

/**
 * A gym's reusable food definition. Values are per serving
 * (e.g. 1 piece of egg, or 100 g of rice). Plans reference foods by id;
 * logged consumption (Module 3B) snapshots the values instead.
 */
const foodSchema = new Schema(
  {
    gymId: tenantField,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    servingSize: { type: Number, required: true, min: 0.0001, max: 10000 },
    servingUnit: servingUnitField,
    calories: { ...nonNegative(10000), required: true },
    protein: { ...nonNegative(1000), required: true },
    carbs: { ...nonNegative(1000), default: null },
    fat: { ...nonNegative(1000), default: null },
    /** Archived foods stay valid for existing plans but can't be newly added. */
    status: { type: String, enum: FOOD_STATUSES, default: "ACTIVE", required: true },
  },
  { timestamps: true }
)

// Food library listing/search: active foods of a gym, alphabetical.
foodSchema.index({ gymId: 1, status: 1, name: 1 })
foodSchema.plugin(tenantGuardPlugin)

export type FoodDoc = InferSchemaType<typeof foodSchema> & { _id: Types.ObjectId }

export const Food: Model<FoodDoc> =
  (models.Food as Model<FoodDoc> | undefined) ?? model<FoodDoc>("Food", foodSchema)
