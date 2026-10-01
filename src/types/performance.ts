import type { WeightUnit } from "@/lib/workout/constants"
import type { PersonalRecords, PlannedRange, Recommendation, RecordKind, SessionComparison, SessionMetrics } from "@/lib/workout/performance"

/** Client-safe DTOs for performance tracking (derived from completed sets; nothing is stored). */

export interface ProgressExercise {
  exerciseId: string
  name: string
  sessionCount: number
  lastDate: string
}

export interface ExerciseSessionSummary {
  workoutSessionId: string
  date: string
  startedAt: string
  dayName: string
  planName: string
  /** Completed sets in the exercise's display unit. */
  sets: { weight: number | null; reps: number }[]
  metrics: SessionMetrics
  /** The immutable snapshot of what was planned that day. */
  planned: PlannedRange & { targetWeight: number | null; weightUnit: WeightUnit }
}

export interface SeriesPoint {
  date: string
  e1rm: number | null
  bestWeight: number | null
  volume: number | null
}

/** Where an explicit "use this target" could be applied. */
export interface PlanTargetInfo {
  plannedExerciseId: string
  planKind: "GYM" | "PERSONAL"
  planName: string
  currentTargetWeight: number | null
  weightUnit: WeightUnit
}

export interface ExerciseProgressView {
  exerciseId: string
  exerciseName: string
  /** All weights below are in this unit. */
  unit: WeightUnit
  sessionCount: number
  latest: ExerciseSessionSummary | null
  previous: ExerciseSessionSummary | null
  comparison: SessionComparison | null
  records: PersonalRecords
  /** Records the latest session set (vs. everything before it). */
  recordsInLatest: RecordKind[]
  /** Newest first, within the optional from/to filter. */
  recent: ExerciseSessionSummary[]
  /** Oldest → newest, for charts. */
  series: SeriesPoint[]
  recommendation: Recommendation
  planTarget: PlanTargetInfo | null
}

export interface SessionExercisePerformance {
  exerciseId: string
  exerciseName: string
  unit: WeightUnit
  current: ExerciseSessionSummary
  previous: ExerciseSessionSummary | null
  comparison: SessionComparison | null
  newRecords: RecordKind[]
}

export interface PerformanceHighlight {
  workoutSessionId: string
  exerciseName: string
  kind: "PR" | "IMPROVED"
  text: string
}
