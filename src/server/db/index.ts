import { connectToDatabase } from "@/server/db/connect"
import { DailyNutritionLog } from "@/server/models/daily-nutrition-log"
import { DietPlan } from "@/server/models/diet-plan"
import { DietPlanAssignment } from "@/server/models/diet-plan-assignment"
import { DietPlanMeal } from "@/server/models/diet-plan-meal"
import { DietPlanMealFood } from "@/server/models/diet-plan-meal-food"
import { Food } from "@/server/models/food"
import { Gym } from "@/server/models/gym"
import { NutritionGoal } from "@/server/models/nutrition-goal"
import { User } from "@/server/models/user"

const allModels = [
  Gym,
  User,
  NutritionGoal,
  Food,
  DietPlan,
  DietPlanMeal,
  DietPlanMealFood,
  DietPlanAssignment,
  DailyNutritionLog,
]

/**
 * Connect and make sure indexes exist before use. Unique indexes (email,
 * slug, one active assignment, …) must exist before transactions rely on
 * them. `init()` is memoized by Mongoose, so calling this on every request
 * is cheap.
 */
export async function dbReady() {
  await connectToDatabase()
  await Promise.all(allModels.map((m) => m.init()))
}
