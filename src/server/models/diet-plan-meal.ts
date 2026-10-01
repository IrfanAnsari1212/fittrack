import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { refField, tenantField } from "@/server/models/shared"

/**
 * A meal slot inside a plan. Names and times are free-form (no hardcoded
 * breakfast/lunch/dinner); `order` controls display order.
 */
const dietPlanMealSchema = new Schema(
  {
    gymId: tenantField,
    dietPlanId: refField("DietPlan"),
    name: { type: String, required: true, trim: true, maxlength: 60 },
    /** 24h "HH:mm". */
    time: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    order: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
)

// Load a plan's meals in display order.
dietPlanMealSchema.index({ gymId: 1, dietPlanId: 1, order: 1 })
dietPlanMealSchema.plugin(tenantGuardPlugin)

export type DietPlanMealDoc = InferSchemaType<typeof dietPlanMealSchema> & { _id: Types.ObjectId }

export const DietPlanMeal: Model<DietPlanMealDoc> =
  (models.DietPlanMeal as Model<DietPlanMealDoc> | undefined) ??
  model<DietPlanMealDoc>("DietPlanMeal", dietPlanMealSchema)
