import { model, models, Schema, type InferSchemaType, type Model, type Types } from "mongoose"

import { tenantGuardPlugin } from "@/server/db/tenant-guard"
import {
  calendarDateField,
  memberField,
  nonNegative,
  servingUnitField,
  tenantField,
} from "@/server/models/shared"

/**
 * What a member actually consumed (Module 3B fills `entries`).
 *
 * Each entry SNAPSHOTS the nutrition values at logging time (see
 * `snapshotConsumption` in src/lib/nutrition/calculations.ts), so editing or
 * archiving a Food never rewrites history. `foodId` / `dietPlanMealId` are
 * kept only as optional links back to the source.
 */
const consumedEntrySchema = new Schema(
  {
    foodId: { type: Schema.Types.ObjectId, ref: "Food", default: null },
    dietPlanMealId: { type: Schema.Types.ObjectId, ref: "DietPlanMeal", default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    quantity: { type: Number, required: true, min: 0, max: 100000 },
    unit: servingUnitField,
    calories: { ...nonNegative(100000), required: true },
    protein: { ...nonNegative(10000), required: true },
    carbs: { ...nonNegative(10000), default: null },
    fat: { ...nonNegative(10000), default: null },
    loggedAt: { type: Date, default: () => new Date() },
  },
  { _id: true }
)

const dailyNutritionLogSchema = new Schema(
  {
    gymId: tenantField,
    userId: memberField,
    date: { ...calendarDateField, required: true, immutable: true },
    entries: { type: [consumedEntrySchema], default: [] },
  },
  { timestamps: true }
)

// One log per member per day; also the lookup path for a member's day.
dailyNutritionLogSchema.index({ gymId: 1, userId: 1, date: -1 }, { unique: true })
dailyNutritionLogSchema.plugin(tenantGuardPlugin)

export type DailyNutritionLogDoc = InferSchemaType<typeof dailyNutritionLogSchema> & { _id: Types.ObjectId }

export const DailyNutritionLog: Model<DailyNutritionLogDoc> =
  (models.DailyNutritionLog as Model<DailyNutritionLogDoc> | undefined) ??
  model<DailyNutritionLogDoc>("DailyNutritionLog", dailyNutritionLogSchema)
