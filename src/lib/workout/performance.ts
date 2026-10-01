import type { WeightUnit } from "@/lib/workout/constants"

/*
 * Pure performance math (no database, no clock). Everything here works on
 * ACTUAL completed sets; the plan is only used for rep-range context.
 *
 * Conventions:
 *  - Only completed sets with reps ≥ 1 count. Bodyweight sets (weight null/0)
 *    count for reps but never for weight, volume or estimated 1RM.
 *  - Mixed kg/lb history is converted to one display unit.
 *  - Estimated 1RM uses Epley: weight × (1 + reps / 30); a 1-rep set is its own
 *    weight. Above 12 reps the estimate is unreliable, so it is omitted.
 *    It is an ESTIMATE, never a tested 1RM.
 */

export const KG_PER_LB = 0.45359237
/** Epley is only used up to this many reps. */
export const MAX_E1RM_REPS = 12

export interface PerformedSet {
  weight: number | null
  weightUnit: WeightUnit
  reps: number | null
}

/** Round to 0.1 for display/storage of derived values (never used to round inputs). */
export const round1 = (n: number) => Math.round(n * 10) / 10

export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight
  return from === "lb" ? weight * KG_PER_LB : weight / KG_PER_LB
}

/** Estimated 1RM for one set, or null when not meaningful. */
export function estimateOneRepMax(weight: number | null, reps: number | null): number | null {
  if (weight == null || weight <= 0 || reps == null || reps < 1 || reps > MAX_E1RM_REPS) return null
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export interface NormalizedSet {
  weight: number | null
  reps: number
}

/** Keep only usable sets, with weights converted to `unit`. */
export function normalizeSets(sets: PerformedSet[], unit: WeightUnit): NormalizedSet[] {
  return sets.flatMap((s) => {
    if (s.reps == null || s.reps < 1) return []
    const weight = s.weight != null && s.weight > 0 ? convertWeight(s.weight, s.weightUnit, unit) : null
    return [{ weight, reps: s.reps }]
  })
}

export interface SessionMetrics {
  setCount: number
  totalReps: number
  /** Heaviest weight lifted (null if only bodyweight sets). */
  bestWeight: number | null
  /** Reps in the best set at `bestWeight` (most reps at that weight). */
  repsAtBestWeight: number | null
  /** Highest reps in any set. */
  bestReps: number
  /** Weight used for `bestReps` (heaviest among ties; null = bodyweight). */
  weightAtBestReps: number | null
  /** Σ weight × reps over weighted sets (null if none). */
  totalVolume: number | null
  /** Highest estimated 1RM among the sets (null if none qualifies). */
  bestE1rm: number | null
  /** Sets performed at `bestWeight`. */
  setsAtBestWeight: number
  /** Fewest reps among sets at `bestWeight`. */
  minRepsAtBestWeight: number | null
}

/** Metrics for one exercise in one session, or null when it has no usable sets. */
export function sessionMetrics(sets: PerformedSet[], unit: WeightUnit): SessionMetrics | null {
  const usable = normalizeSets(sets, unit)
  if (usable.length === 0) return null
  const weighted = usable.filter((s) => s.weight != null) as { weight: number; reps: number }[]
  const bestWeight = weighted.length ? Math.max(...weighted.map((s) => s.weight)) : null
  const atBest = bestWeight == null ? [] : weighted.filter((s) => s.weight === bestWeight)
  const bestReps = Math.max(...usable.map((s) => s.reps))
  const bestRepSets = usable.filter((s) => s.reps === bestReps)
  const weightAtBestReps = bestRepSets.reduce<number | null>((best, s) => (s.weight != null && (best == null || s.weight > best) ? s.weight : best), null)
  const e1rms = weighted.map((s) => estimateOneRepMax(s.weight, s.reps)).filter((v): v is number => v != null)
  return {
    setCount: usable.length,
    totalReps: usable.reduce((n, s) => n + s.reps, 0),
    bestWeight,
    repsAtBestWeight: atBest.length ? Math.max(...atBest.map((s) => s.reps)) : null,
    bestReps,
    weightAtBestReps,
    totalVolume: weighted.length ? weighted.reduce((n, s) => n + s.weight * s.reps, 0) : null,
    bestE1rm: e1rms.length ? Math.max(...e1rms) : null,
    setsAtBestWeight: atBest.length,
    minRepsAtBestWeight: atBest.length ? Math.min(...atBest.map((s) => s.reps)) : null,
  }
}

// ── Comparison ───────────────────────────────────────────────────────────

const diff = (a: number | null, b: number | null) => (a == null || b == null ? null : round1(a - b))

export interface SessionComparison {
  bestWeightDiff: number | null
  /** Reps at the heaviest weight (current vs previous), only when both used the same weight. */
  repsAtSameWeightDiff: number | null
  sameWeight: boolean
  bestRepsDiff: number
  volumeDiff: number | null
  e1rmDiff: number | null
}

/** Factual current-vs-previous comparison (no judgement). */
export function compareSessions(current: SessionMetrics, previous: SessionMetrics): SessionComparison {
  const sameWeight =
    current.bestWeight != null && previous.bestWeight != null && Math.abs(current.bestWeight - previous.bestWeight) < 0.05
  return {
    bestWeightDiff: diff(current.bestWeight, previous.bestWeight),
    sameWeight,
    repsAtSameWeightDiff: sameWeight && current.repsAtBestWeight != null && previous.repsAtBestWeight != null ? current.repsAtBestWeight - previous.repsAtBestWeight : null,
    bestRepsDiff: current.bestReps - previous.bestReps,
    volumeDiff: diff(current.totalVolume, previous.totalVolume),
    e1rmDiff: diff(current.bestE1rm, previous.bestE1rm),
  }
}

// ── Personal records ─────────────────────────────────────────────────────

export interface PersonalRecords {
  highestWeight: { value: number; reps: number; date: string } | null
  highestReps: { value: number; weight: number | null; date: string } | null
  highestE1rm: { value: number; weight: number; reps: number; date: string } | null
  highestVolume: { value: number; date: string } | null
}

export const EMPTY_RECORDS: PersonalRecords = { highestWeight: null, highestReps: null, highestE1rm: null, highestVolume: null }

export interface DatedSets {
  date: string
  /** Real instant of the session start, for stable ordering within a day. */
  startedAt: string
  sets: PerformedSet[]
}

/**
 * Personal records over the given sessions. Computed from actual sets, so a
 * worse session can never lower a record. Ties keep the EARLIEST date.
 */
export function personalRecords(sessions: DatedSets[], unit: WeightUnit): PersonalRecords {
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt))
  const records: PersonalRecords = { ...EMPTY_RECORDS }
  for (const session of ordered) {
    const usable = normalizeSets(session.sets, unit)
    for (const s of usable) {
      if (s.weight != null && (!records.highestWeight || s.weight > records.highestWeight.value)) {
        records.highestWeight = { value: s.weight, reps: s.reps, date: session.date }
      }
      if (!records.highestReps || s.reps > records.highestReps.value) {
        records.highestReps = { value: s.reps, weight: s.weight, date: session.date }
      }
      const e = s.weight != null ? estimateOneRepMax(s.weight, s.reps) : null
      if (e != null && s.weight != null && (!records.highestE1rm || e > records.highestE1rm.value)) {
        records.highestE1rm = { value: e, weight: s.weight, reps: s.reps, date: session.date }
      }
    }
    const metrics = sessionMetrics(session.sets, unit)
    if (metrics?.totalVolume != null && (!records.highestVolume || metrics.totalVolume > records.highestVolume.value)) {
      records.highestVolume = { value: metrics.totalVolume, date: session.date }
    }
  }
  return records
}

export type RecordKind = "weight" | "reps" | "e1rm" | "volume"

/**
 * Which records a session SET compared with everything before it:
 * strictly greater than every earlier session. The first-ever session is
 * not a "new PR" (there is nothing to beat).
 */
export function recordsSetIn(current: DatedSets, earlier: DatedSets[], unit: WeightUnit): RecordKind[] {
  if (earlier.length === 0) return []
  const before = personalRecords(earlier, unit)
  const now = sessionMetrics(current.sets, unit)
  if (!now) return []
  const kinds: RecordKind[] = []
  if (now.bestWeight != null && before.highestWeight && now.bestWeight > before.highestWeight.value) kinds.push("weight")
  if (before.highestReps && now.bestReps > before.highestReps.value) kinds.push("reps")
  if (now.bestE1rm != null && before.highestE1rm && now.bestE1rm > before.highestE1rm.value) kinds.push("e1rm")
  if (now.totalVolume != null && before.highestVolume && now.totalVolume > before.highestVolume.value) kinds.push("volume")
  return kinds
}

// ── Recommendation ───────────────────────────────────────────────────────

export interface PlannedRange {
  sets: number
  repsMin: number
  repsMax: number | null
}

export type RecommendationKind =
  | "INSUFFICIENT_DATA"
  | "WEIGHT_UP"
  | "TOP_OF_RANGE"
  | "TARGET_MET"
  | "SAME"
  | "REPS_UP"
  | "REPS_DOWN"
  | "WEIGHT_DOWN"

export interface Recommendation {
  kind: RecommendationKind
  /** Factual observation about what happened (never judgemental). */
  observation: string
  /** A gentle suggestion, or null when the data doesn't justify one. */
  suggestion: string | null
  /**
   * A concrete weight, ONLY when the member's own history shows a step size
   * (their smallest observed increase). Never a universal increment.
   */
  suggestedWeight: number | null
}

const fmt = (n: number, unit: WeightUnit) => `${round1(n)} ${unit}`

/** Smallest positive increase in best weight between consecutive sessions (oldest→newest), or null. */
export function observedStep(history: SessionMetrics[]): number | null {
  const steps: number[] = []
  for (let i = 1; i < history.length; i++) {
    const a = history[i - 1].bestWeight
    const b = history[i].bestWeight
    if (a != null && b != null && b - a > 0.05) steps.push(round1(b - a))
  }
  return steps.length ? Math.min(...steps) : null
}

/**
 * Conservative recommendation from the member's recent completed sessions
 * (oldest → newest) and the latest session's planned rep range. It never
 * modifies anything: it only describes and, when warranted, suggests.
 */
export function recommend(history: SessionMetrics[], planned: PlannedRange | null, unit: WeightUnit): Recommendation {
  if (history.length < 2) {
    return {
      kind: "INSUFFICIENT_DATA",
      observation: history.length === 0 ? "No completed workouts yet." : "Complete more sessions to compare your progress.",
      suggestion: null,
      suggestedWeight: null,
    }
  }
  const cur = history[history.length - 1]
  const prev = history[history.length - 2]
  const step = observedStep(history)
  const none = { suggestion: null, suggestedWeight: null } as const

  if (cur.bestWeight == null || prev.bestWeight == null) {
    // Bodyweight exercise: compare reps only, no weight advice.
    if (cur.bestReps > prev.bestReps) return { kind: "REPS_UP", observation: `Best reps increased from ${prev.bestReps} to ${cur.bestReps}.`, ...none }
    if (cur.bestReps < prev.bestReps) return { kind: "REPS_DOWN", observation: `Best reps decreased from ${prev.bestReps} to ${cur.bestReps}.`, ...none }
    return { kind: "SAME", observation: "Same best reps as last time.", ...none }
  }

  const delta = round1(cur.bestWeight - prev.bestWeight)
  if (delta > 0.05) {
    const kept = cur.repsAtBestWeight != null && prev.repsAtBestWeight != null && cur.repsAtBestWeight >= prev.repsAtBestWeight
    return {
      kind: "WEIGHT_UP",
      observation: kept
        ? `Working weight increased by ${fmt(delta, unit)} while maintaining reps.`
        : `Working weight increased by ${fmt(delta, unit)}; reps at the top weight went from ${prev.repsAtBestWeight} to ${cur.repsAtBestWeight}.`,
      ...none,
    }
  }
  if (delta < -0.05) {
    return { kind: "WEIGHT_DOWN", observation: `Working weight decreased from ${fmt(prev.bestWeight, unit)} to ${fmt(cur.bestWeight, unit)}.`, ...none }
  }

  // Same weight from here.
  const repDiff = (cur.repsAtBestWeight ?? 0) - (prev.repsAtBestWeight ?? 0)
  if (repDiff < 0) {
    return { kind: "REPS_DOWN", observation: `Reps decreased from ${prev.repsAtBestWeight} to ${cur.repsAtBestWeight} at the same weight.`, ...none }
  }

  const completedPlannedSets = planned != null && cur.setsAtBestWeight >= planned.sets
  const increase = (kind: RecommendationKind, observation: string): Recommendation => ({
    kind,
    observation,
    suggestion: "Consider a small weight increase next session.",
    suggestedWeight: step != null ? round1(cur.bestWeight! + step) : null,
  })

  if (planned?.repsMax != null && completedPlannedSets && cur.minRepsAtBestWeight != null && cur.minRepsAtBestWeight >= planned.repsMax) {
    return increase("TOP_OF_RANGE", "You reached the top of the planned rep range on every set.")
  }
  if (planned != null && planned.repsMax == null && completedPlannedSets) {
    const metNow = cur.minRepsAtBestWeight != null && cur.minRepsAtBestWeight >= planned.repsMin
    const metBefore = prev.setsAtBestWeight >= planned.sets && prev.minRepsAtBestWeight != null && prev.minRepsAtBestWeight >= planned.repsMin
    // A fixed target needs two matching sessions in a row before anything is suggested.
    if (metNow && metBefore) return increase("TARGET_MET", `You hit your target reps on every set in two sessions in a row at ${fmt(cur.bestWeight, unit)}.`)
  }
  if (repDiff > 0) return { kind: "REPS_UP", observation: `Reps increased from ${prev.repsAtBestWeight} to ${cur.repsAtBestWeight} at the same weight.`, ...none }
  return { kind: "SAME", observation: "Same weight and reps as last time.", ...none }
}

// ── Planned vs actual (from the session's own immutable snapshot) ───────

export interface PlannedVsActual {
  unit: WeightUnit
  actualWeight: number | null
  actualReps: number | null
  /** Actual top weight minus the planned target (same unit); null if either is missing. */
  weightDiff: number | null
}

/**
 * Compare what a logged exercise actually did with what the SAME session's
 * snapshot said was planned. Uses only that session's data — never the
 * current plan — so history can't drift when a plan changes.
 */
export function plannedVsActual(
  planned: { targetWeight: number | null; weightUnit: WeightUnit },
  sets: PerformedSet[]
): PlannedVsActual | null {
  const unit = sets.find((s) => s.weight != null)?.weightUnit ?? planned.weightUnit
  const metrics = sessionMetrics(sets, unit)
  if (!metrics) return null
  const plannedWeight = planned.targetWeight == null ? null : convertWeight(planned.targetWeight, planned.weightUnit, unit)
  return {
    unit,
    actualWeight: metrics.bestWeight == null ? null : round1(metrics.bestWeight),
    actualReps: metrics.repsAtBestWeight ?? metrics.bestReps,
    weightDiff: metrics.bestWeight != null && plannedWeight != null ? round1(metrics.bestWeight - plannedWeight) : null,
  }
}
