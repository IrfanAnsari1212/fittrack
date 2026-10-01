import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import { refField, servingUnitField, tenantField } from "@/server/models/shared"

/**
 * A planned food inside a meal: a reference to Food plus a quantity.
 * Nutrition is computed from the Food (not duplicated here), so editing a
 * food updates every plan that uses it. `dietPlanId` is denormalized from
 * the meal (server-side) so a whole plan loads in one query.
 */
const dietPlanMealFoodSchema = new Schema(
  {
    gymId: tenantField,
    dietPlanId: refField("DietPlan"),
    dietPlanMealId: refField("DietPlanMeal"),
    foodId: refField("Food"),
    quantity: { type: Number, required: true, min: 0.0001, max: 100000 },
    /** The food's serving unit, or "serving". */
    unit: servingUnitField,
  },
  { timestamps: true }
)

// Load every food of a plan (prefix gymId+dietPlanId), or of one meal.
dietPlanMealFoodSchema.index({ gymId: 1, dietPlanId: 1, dietPlanMealId: 1 })
// "Is this food used by any plan?" before deleting a food.
dietPlanMealFoodSchema.index({ gymId: 1, foodId: 1 })
dietPlanMealFoodSchema.plugin(tenantGuardPlugin)

export type DietPlanMealFoodDoc = InferSchemaType<typeof dietPlanMealFoodSchema> & { _id: Types.ObjectId }

export const DietPlanMealFood: Model<DietPlanMealFoodDoc> =
  (models.DietPlanMealFood as Model<DietPlanMealFoodDoc> | undefined) ??
  model<DietPlanMealFoodDoc>("DietPlanMealFood", dietPlanMealFoodSchema)
