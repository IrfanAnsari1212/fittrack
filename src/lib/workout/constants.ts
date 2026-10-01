/** Workout vocabulary shared by validation, models and UI (client-safe). */

export const EXERCISE_CATEGORIES = ["STRENGTH", "CARDIO", "MOBILITY", "OTHER"] as const
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number]

export const EXERCISE_CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  STRENGTH: "Strength",
  CARDIO: "Cardio",
  MOBILITY: "Mobility",
  OTHER: "Other",
}

export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Legs",
  "Glutes",
  "Core",
  "Full Body",
  "Cardio",
] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const WEIGHT_UNITS = ["kg", "lb"] as const
export type WeightUnit = (typeof WEIGHT_UNITS)[number]

export const SESSION_STATUSES = ["IN_PROGRESS", "COMPLETED"] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]
