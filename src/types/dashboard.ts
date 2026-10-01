/**
 * View-model types for the dashboard. These describe what the UI needs to
 * render, not how data is stored — persistence models arrive in later modules
 * and should be mapped into these shapes.
 */

export interface MacroTarget {
  consumed: number
  target: number
}

export interface DailyNutritionSummary {
  calories: MacroTarget
  protein: MacroTarget
}

export type MealStatus = "completed" | "upcoming" | "skipped"

export interface MealSummary {
  id: string
  name: string
  time: string // "HH:mm", 24h
  calories: number
  protein: number
  status: MealStatus
}

export interface WorkoutExerciseSummary {
  id: string
  name: string
  sets: number
  reps: string // e.g. "8-10"
  weightKg?: number
}

export interface WorkoutSummary {
  id: string
  name: string
  focus: string
  durationMinutes: number
  exercises: WorkoutExerciseSummary[]
  completed: boolean
}

/** 1–5 scale used for subjective recovery metrics. */
export type RatingScale = 1 | 2 | 3 | 4 | 5

export interface RecoverySummary {
  sleepHours: number
  sleepTargetHours: number
  energy: RatingScale
  soreness: RatingScale
  note?: string
}

export interface WeightPoint {
  date: string // ISO date
  weightKg: number
}

export interface WeightSummary {
  currentKg: number
  goalKg: number
  startKg: number
  history: WeightPoint[]
}

export interface ProgressGoal {
  id: string
  label: string
  current: number
  target: number
  unit: string
}

export interface DashboardData {
  nutrition: DailyNutritionSummary
  meals: MealSummary[]
  workout: WorkoutSummary | null
  recovery: RecoverySummary | null
  weight: WeightSummary | null
  goals: ProgressGoal[]
}
