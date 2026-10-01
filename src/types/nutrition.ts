import type { CalendarDate } from "@/lib/nutrition/calendar-date"
import type { GoalProgress, NutritionTotals } from "@/lib/nutrition/calculations"
import type { ServingUnit } from "@/lib/nutrition/units"

/** Client-safe nutrition views returned by services. Timestamps are ISO strings. */

export interface NutritionGoalView {
  id: string
  dailyCalories: number
  dailyProtein: number
  dailyCarbs: number | null
  dailyFat: number | null
  effectiveFrom: CalendarDate
  updatedAt: string
}

export interface FoodView {
  id: string
  name: string
  servingSize: number
  servingUnit: ServingUnit
  calories: number
  protein: number
  carbs: number | null
  fat: number | null
  status: "ACTIVE" | "ARCHIVED"
}

export interface DietPlanSummary {
  id: string
  name: string
  description: string | null
  status: "ACTIVE" | "ARCHIVED"
  mealCount: number
  updatedAt: string
}

export interface PlannedFoodView {
  id: string
  foodId: string
  foodName: string
  foodStatus: "ACTIVE" | "ARCHIVED"
  quantity: number
  unit: ServingUnit
  nutrition: NutritionTotals
}

export interface PlannedMealView {
  id: string
  name: string
  time: string
  order: number
  foods: PlannedFoodView[]
  totals: NutritionTotals
}

export interface DietPlanDetail {
  id: string
  name: string
  description: string | null
  status: "ACTIVE" | "ARCHIVED"
  /** null = gym plan (admin library); a member id = that member's personal plan. */
  ownerUserId: string | null
  /** For a personal copy made by "customize": the gym plan it was copied from. */
  sourcePlanId: string | null
  createdAt: string
  updatedAt: string
  meals: PlannedMealView[]
  /** Planned daily totals across all meals. */
  totals: NutritionTotals
}

export interface DietPlanAssignmentView {
  id: string
  dietPlanId: string
  dietPlanName: string
  /** Whether the assigned plan is the gym's shared plan or the member's own. */
  dietPlanKind: "GYM" | "PERSONAL"
  memberId: string
  startDate: CalendarDate
  endDate: CalendarDate | null
  status: "ACTIVE" | "COMPLETED" | "CANCELLED"
  assignedBy: string
  createdAt: string
}

export interface ConsumedEntryView {
  id: string
  foodId: string | null
  dietPlanMealId: string | null
  name: string
  quantity: number
  unit: ServingUnit
  calories: number
  protein: number
  carbs: number | null
  fat: number | null
  loggedAt: string
}

export interface DailyNutritionLogView {
  id: string
  date: CalendarDate
  entries: ConsumedEntryView[]
  totals: NutritionTotals
}

export interface NutritionDayView {
  date: CalendarDate
  goal: NutritionGoalView | null
  /** The plan that applies on `date` (not just "the active one"). */
  plan: { assignment: DietPlanAssignmentView; plan: DietPlanDetail } | null
  log: DailyNutritionLogView | null
  /** ACTUAL consumption only — never planned totals. */
  consumed: NutritionTotals
  /** Planned meals with at least one logged entry linked to them. */
  completedMealIds: string[]
  progress: {
    calories: GoalProgress
    protein: GoalProgress
  } | null
}
