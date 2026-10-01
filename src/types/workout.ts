import type { ExerciseCategory, MuscleGroup, SessionStatus, WeightUnit } from "@/lib/workout/constants"

/** Client-safe workout DTOs (ids are strings, dates are ISO strings or "YYYY-MM-DD"). */

export interface ExerciseView {
  id: string
  name: string
  description: string | null
  muscleGroup: MuscleGroup
  equipment: string | null
  category: ExerciseCategory
  status: "ACTIVE" | "ARCHIVED"
}

// ── Planned ──────────────────────────────────────────────────────────────

export interface PlannedExerciseView {
  id: string
  exerciseId: string
  exerciseName: string
  exerciseStatus: "ACTIVE" | "ARCHIVED"
  muscleGroup: MuscleGroup
  order: number
  sets: number
  repsMin: number
  repsMax: number | null
  targetWeight: number | null
  weightUnit: WeightUnit
  restSeconds: number | null
  notes: string | null
}

export interface WorkoutDayView {
  id: string
  name: string
  description: string | null
  order: number
  exercises: PlannedExerciseView[]
}

export interface WorkoutPlanSummary {
  id: string
  name: string
  description: string | null
  status: "ACTIVE" | "ARCHIVED"
  dayCount: number
  updatedAt: string
}

export interface WorkoutPlanDetail {
  id: string
  name: string
  description: string | null
  status: "ACTIVE" | "ARCHIVED"
  /** null = gym plan; a member id = that member's personal plan. */
  ownerUserId: string | null
  sourcePlanId: string | null
  createdAt: string
  updatedAt: string
  days: WorkoutDayView[]
}

export interface WorkoutAssignmentView {
  id: string
  workoutPlanId: string
  workoutPlanName: string
  workoutPlanKind: "GYM" | "PERSONAL"
  memberId: string
  startDate: string
  endDate: string | null
  status: "ACTIVE" | "COMPLETED" | "CANCELLED"
  assignedBy: string
  createdAt: string
}

// ── Actual ───────────────────────────────────────────────────────────────

export interface SetLogView {
  id: string
  setNumber: number
  weight: number | null
  weightUnit: WeightUnit
  reps: number | null
  completed: boolean
}

export interface ExerciseSessionView {
  id: string
  exerciseId: string
  exerciseName: string
  muscleGroup: string
  order: number
  completed: boolean
  /** Snapshot of the prescription this exercise came from. */
  planned: {
    sets: number
    repsMin: number
    repsMax: number | null
    targetWeight: number | null
    weightUnit: WeightUnit
    restSeconds: number | null
    notes: string | null
  }
  sets: SetLogView[]
}

export interface WorkoutSessionView {
  id: string
  memberId: string
  date: string
  planName: string
  dayName: string
  status: SessionStatus
  startedAt: string
  completedAt: string | null
  durationSeconds: number | null
  exercises: ExerciseSessionView[]
}

/** What the member sees for one calendar day. */
export interface WorkoutDayOverview {
  date: string
  /** The plan that applies on `date` (assignment range), if any. */
  plan: { assignment: WorkoutAssignmentView; plan: WorkoutPlanDetail } | null
  /** The day of the plan that comes next in the rotation (not a fixed weekday). */
  suggestedDayId: string | null
  /** A workout in progress, whatever its date. */
  inProgress: WorkoutSessionView | null
  /** Workouts completed on `date`. */
  completedToday: WorkoutSessionView[]
}
