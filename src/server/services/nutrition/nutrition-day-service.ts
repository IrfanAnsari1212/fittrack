import { progressToward, ZERO_NUTRITION } from "@/lib/nutrition/calculations"
import { calendarDateSchema } from "@/lib/validations/nutrition"
import { parseInput } from "@/server/errors"
import { getDietPlanForDate } from "@/server/services/nutrition/assignment-service"
import { getDailyNutritionLog } from "@/server/services/nutrition/daily-log-service"
import { getCurrentNutritionGoal } from "@/server/services/nutrition/goal-service"
import type { MemberTarget } from "@/server/services/nutrition/member-target"
import type { NutritionDayView } from "@/types/nutrition"

/**
 * Read model for one member-day: goal in effect, plan that applies, ACTUAL
 * log, and progress (consumed vs goal). `date` is the caller-supplied local
 * day. Planned totals are never used as consumed totals; meal "completion"
 * is derived from logged entries linked to the meal — never stored.
 */
export async function getNutritionDay(target: MemberTarget, date: string): Promise<NutritionDayView> {
  const day = parseInput(calendarDateSchema, date)
  const [goal, plan, log] = await Promise.all([
    getCurrentNutritionGoal(target, day),
    getDietPlanForDate(target, day),
    getDailyNutritionLog(target, day),
  ])
  const consumed = log?.totals ?? ZERO_NUTRITION
  const completedMealIds = [
    ...new Set((log?.entries ?? []).map((e) => e.dietPlanMealId).filter((id): id is string => Boolean(id))),
  ]
  return {
    date: day,
    goal,
    plan,
    log,
    consumed,
    completedMealIds,
    progress: goal
      ? {
          calories: progressToward(consumed.calories, goal.dailyCalories),
          protein: progressToward(consumed.protein, goal.dailyProtein),
        }
      : null,
  }
}
