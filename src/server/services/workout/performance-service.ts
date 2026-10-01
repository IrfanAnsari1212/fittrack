import type { Types } from "mongoose"

import { historyFilterSchema, objectIdSchema } from "@/lib/validations/workout"
import type { WeightUnit } from "@/lib/workout/constants"
import {
  compareSessions,
  convertWeight,
  personalRecords,
  recommend,
  recordsSetIn,
  round1,
  sessionMetrics,
  type DatedSets,
} from "@/lib/workout/performance"
import { dbReady } from "@/server/db"
import { parseInput } from "@/server/errors"
import { ExerciseSession } from "@/server/models/exercise-session"
import { SetLog } from "@/server/models/set-log"
import { WorkoutSession } from "@/server/models/workout-session"
import { scopeToTarget, type MemberTarget } from "@/server/services/nutrition/member-target"
import { getActiveWorkoutPlan } from "@/server/services/workout/workout-assignment-service"
import type {
  ExerciseProgressView,
  ExerciseSessionSummary,
  PerformanceHighlight,
  PlanTargetInfo,
  ProgressExercise,
  SeriesPoint,
  SessionExercisePerformance,
} from "@/types/performance"

/*
 * Performance tracking (Module 5). EVERYTHING here is derived on read from
 * Module 4's data — completed WorkoutSessions, their ExerciseSessions (with
 * the immutable planned snapshot) and the actual SetLogs. Nothing is stored,
 * nothing is written, and the plan is never modified. There is no second
 * history system: only COMPLETED sessions count (in-progress sets are ignored).
 *
 * Every query goes through `scopeToTarget`, so a member can only ever read
 * themselves; an admin uses a verified `gymMemberTarget` (own gym only).
 * Reads are bounded: one exercise's history is capped (`HISTORY_CAP`) and
 * the recent-sessions table is limited. No "today" is derived anywhere.
 */

/** Most exercise-sessions read for one exercise (≈ years of normal training). */
const HISTORY_CAP = 1000
const RECENT_DEFAULT = 10
const SERIES_POINTS = 30
/** Sessions fed to the recommendation. */
const RECOMMENDATION_WINDOW = 6

interface ExerciseSessionRecord {
  _id: Types.ObjectId
  workoutSessionId: Types.ObjectId
  exerciseId: Types.ObjectId
  exerciseName: string
  planned: { sets: number; repsMin: number; repsMax?: number | null; targetWeight?: number | null; weightUnit: WeightUnit }
}

interface CompletedSessionRecord {
  _id: Types.ObjectId
  date: string
  startedAt: Date
  dayName: string
  planName: string
}

interface SetRecord {
  exerciseSessionId: Types.ObjectId
  weight?: number | null
  weightUnit: WeightUnit
  reps?: number | null
}

/** One exercise in one completed workout, in the raw units it was logged in. */
interface Entry {
  workoutSessionId: string
  date: string
  startedAt: string
  dayName: string
  planName: string
  exerciseName: string
  planned: ExerciseSessionRecord["planned"]
  sets: { weight: number | null; weightUnit: WeightUnit; reps: number | null }[]
}

const byTime = (a: Entry, b: Entry) => a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt)
const dated = (e: Entry): DatedSets => ({ date: e.date, startedAt: e.startedAt, sets: e.sets })

/** All completed workouts' entries for one exercise, oldest → newest. Same-workout duplicates are merged. */
async function loadEntries(target: MemberTarget, exerciseId: string): Promise<Entry[]> {
  const exerciseSessions = await ExerciseSession.find(scopeToTarget(target, { exerciseId }))
    .sort({ createdAt: -1 })
    .limit(HISTORY_CAP)
    .select("workoutSessionId exerciseId exerciseName planned")
    .lean<ExerciseSessionRecord[]>()
  if (exerciseSessions.length === 0) return []

  const sessions = await WorkoutSession.find(
    scopeToTarget(target, { _id: { $in: exerciseSessions.map((e) => e.workoutSessionId) }, status: "COMPLETED" })
  )
    .select("date startedAt dayName planName")
    .lean<CompletedSessionRecord[]>()
  const sessionById = new Map(sessions.map((s) => [s._id.toString(), s]))
  const completed = exerciseSessions.filter((e) => sessionById.has(e.workoutSessionId.toString()))
  if (completed.length === 0) return []

  const sets = await SetLog.find(scopeToTarget(target, { exerciseSessionId: { $in: completed.map((e) => e._id) }, completed: true }))
    .sort({ setNumber: 1 })
    .select("exerciseSessionId weight weightUnit reps")
    .lean<SetRecord[]>()

  const merged = new Map<string, Entry>()
  for (const es of completed) {
    const session = sessionById.get(es.workoutSessionId.toString())!
    const key = es.workoutSessionId.toString()
    const own = sets
      .filter((s) => s.exerciseSessionId.equals(es._id))
      .map((s) => ({ weight: s.weight ?? null, weightUnit: s.weightUnit, reps: s.reps ?? null }))
    const existing = merged.get(key)
    if (existing) existing.sets.push(...own)
    else {
      merged.set(key, {
        workoutSessionId: key,
        date: session.date,
        startedAt: session.startedAt.toISOString(),
        dayName: session.dayName,
        planName: session.planName,
        exerciseName: es.exerciseName,
        planned: es.planned,
        sets: own,
      })
    }
  }
  return [...merged.values()].sort(byTime)
}

/** The unit of the most recent completed set (else the latest planned unit, else kg). */
function displayUnit(entries: Entry[]): WeightUnit {
  for (let i = entries.length - 1; i >= 0; i--) {
    const set = entries[i].sets.find((s) => s.reps != null)
    if (set) return set.weightUnit
  }
  return entries[entries.length - 1]?.planned.weightUnit ?? "kg"
}

function summarize(entry: Entry, unit: WeightUnit): ExerciseSessionSummary | null {
  const metrics = sessionMetrics(entry.sets, unit)
  if (!metrics) return null
  return {
    workoutSessionId: entry.workoutSessionId,
    date: entry.date,
    startedAt: entry.startedAt,
    dayName: entry.dayName,
    planName: entry.planName,
    sets: entry.sets
      .filter((s) => s.reps != null && s.reps >= 1)
      .map((s) => ({
        weight: s.weight != null && s.weight > 0 ? round1(convertWeight(s.weight, s.weightUnit, unit)) : null,
        reps: s.reps as number,
      })),
    metrics,
    planned: {
      sets: entry.planned.sets,
      repsMin: entry.planned.repsMin,
      repsMax: entry.planned.repsMax ?? null,
      targetWeight: entry.planned.targetWeight ?? null,
      weightUnit: entry.planned.weightUnit,
    },
  }
}

const seriesPoint = (s: ExerciseSessionSummary): SeriesPoint => ({
  date: s.date,
  e1rm: s.metrics.bestE1rm == null ? null : round1(s.metrics.bestE1rm),
  bestWeight: s.metrics.bestWeight == null ? null : round1(s.metrics.bestWeight),
  volume: s.metrics.totalVolume == null ? null : round1(s.metrics.totalVolume),
})

// ── Exercise list ────────────────────────────────────────────────────────

/** Exercises the member has completed workouts for (most recently trained first). */
export async function listProgressExercises(target: MemberTarget): Promise<ProgressExercise[]> {
  await dbReady()
  const sessions = await WorkoutSession.find(scopeToTarget(target, { status: "COMPLETED" }))
    .sort({ date: -1, startedAt: -1 })
    .limit(300)
    .select("date")
    .lean<{ _id: Types.ObjectId; date: string }[]>()
  if (sessions.length === 0) return []
  const dateById = new Map(sessions.map((s) => [s._id.toString(), s.date]))
  const performed = await SetLog.distinct(
    "exerciseSessionId",
    scopeToTarget(target, { workoutSessionId: { $in: sessions.map((s) => s._id) }, completed: true, reps: { $gte: 1 } })
  )
  // Only exercises with at least one completed set (a planned-but-skipped exercise isn't progress).
  const exerciseSessions = await ExerciseSession.find(scopeToTarget(target, { _id: { $in: performed } }))
    .select("workoutSessionId exerciseId exerciseName")
    .lean<{ workoutSessionId: Types.ObjectId; exerciseId: Types.ObjectId; exerciseName: string }[]>()
  const byExercise = new Map<string, { name: string; sessions: Set<string>; lastDate: string }>()
  for (const es of exerciseSessions) {
    const id = es.exerciseId.toString()
    const date = dateById.get(es.workoutSessionId.toString()) ?? ""
    const entry = byExercise.get(id) ?? { name: es.exerciseName, sessions: new Set<string>(), lastDate: "" }
    entry.sessions.add(es.workoutSessionId.toString())
    if (date > entry.lastDate) {
      entry.lastDate = date
      entry.name = es.exerciseName
    }
    byExercise.set(id, entry)
  }
  return [...byExercise.entries()]
    .map(([exerciseId, v]) => ({ exerciseId, name: v.name, sessionCount: v.sessions.size, lastDate: v.lastDate }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name))
}

// ── One exercise ─────────────────────────────────────────────────────────

export interface ProgressOptions {
  /** Calendar-day filter for the recent-sessions table only (records are lifetime). */
  from?: string
  to?: string
  limit?: number
}

/**
 * Progress for one exercise of `target`: records, latest vs previous,
 * recent sessions, chart series and a conservative recommendation.
 * An exercise id the member has no history for simply yields empty progress.
 */
export async function getExerciseProgress(
  target: MemberTarget,
  exerciseId: string,
  options: ProgressOptions = {}
): Promise<ExerciseProgressView> {
  const id = parseInput(objectIdSchema, exerciseId)
  const { from, to, limit } = parseInput(historyFilterSchema, { limit: RECENT_DEFAULT, ...options })
  await dbReady()
  const entries = await loadEntries(target, id)
  const unit = displayUnit(entries)
  const summaries = entries.map((e) => summarize(e, unit)).filter((s): s is ExerciseSessionSummary => s != null)
  const usableEntries = entries.filter((e) => summaries.some((s) => s.workoutSessionId === e.workoutSessionId))

  const latest = summaries.at(-1) ?? null
  const previous = summaries.length >= 2 ? summaries.at(-2)! : null
  const latestEntry = usableEntries.at(-1)
  const recent = summaries
    .filter((s) => (!from || s.date >= from) && (!to || s.date <= to))
    .slice(-limit)
    .reverse()

  const window = summaries.slice(-RECOMMENDATION_WINDOW)
  const recommendation = recommend(
    window.map((s) => s.metrics),
    latest ? { sets: latest.planned.sets, repsMin: latest.planned.repsMin, repsMax: latest.planned.repsMax } : null,
    unit
  )

  return {
    exerciseId: id,
    exerciseName: entries.at(-1)?.exerciseName ?? "",
    unit,
    sessionCount: summaries.length,
    latest,
    previous,
    comparison: latest && previous ? compareSessions(latest.metrics, previous.metrics) : null,
    records: personalRecords(usableEntries.map(dated), unit),
    recordsInLatest: latestEntry ? recordsSetIn(dated(latestEntry), usableEntries.slice(0, -1).map(dated), unit) : [],
    recent,
    series: summaries.slice(-SERIES_POINTS).map(seriesPoint),
    recommendation,
    planTarget: await getPlanTargetFor(target, id),
  }
}

/**
 * Where "use this target" could be applied: the exercise's entry in the
 * member's CURRENT plan. Read-only; the explicit update itself lives in the
 * workout-plan service (own personal plans only).
 */
export async function getPlanTargetFor(target: MemberTarget, exerciseId: string): Promise<PlanTargetInfo | null> {
  const id = parseInput(objectIdSchema, exerciseId)
  const active = await getActiveWorkoutPlan(target)
  if (!active) return null
  for (const day of active.plan.days) {
    const item = day.exercises.find((e) => e.exerciseId === id)
    if (item) {
      return {
        plannedExerciseId: item.id,
        planKind: active.assignment.workoutPlanKind,
        planName: active.plan.name,
        currentTargetWeight: item.targetWeight,
        weightUnit: item.weightUnit,
      }
    }
  }
  return null
}

// ── One workout ──────────────────────────────────────────────────────────

/**
 * Performance of every exercise in ONE completed workout: its numbers, the
 * previous comparable session and any records it set. Uses the stored sets
 * and the session's own planned snapshot — never the current plan.
 */
export async function getSessionPerformance(target: MemberTarget, sessionId: string): Promise<SessionExercisePerformance[]> {
  const id = parseInput(objectIdSchema, sessionId)
  await dbReady()
  const session = await WorkoutSession.findOne(scopeToTarget(target, { _id: id, status: "COMPLETED" })).select("_id").lean()
  if (!session) return []
  const exerciseSessions = await ExerciseSession.find(scopeToTarget(target, { workoutSessionId: id }))
    .select("exerciseId")
    .lean<{ exerciseId: Types.ObjectId }[]>()
  const exerciseIds = [...new Set(exerciseSessions.map((e) => e.exerciseId.toString()))]

  const results: SessionExercisePerformance[] = []
  for (const exerciseId of exerciseIds) {
    const entries = await loadEntries(target, exerciseId)
    const unit = displayUnit(entries)
    const index = entries.findIndex((e) => e.workoutSessionId === id)
    if (index < 0) continue
    const current = summarize(entries[index], unit)
    if (!current) continue
    const earlier = entries.slice(0, index)
    const previousSummary = [...earlier].reverse().map((e) => summarize(e, unit)).find((s) => s != null) ?? null
    results.push({
      exerciseId,
      exerciseName: entries[index].exerciseName,
      unit,
      current,
      previous: previousSummary,
      comparison: previousSummary ? compareSessions(current.metrics, previousSummary.metrics) : null,
      newRecords: recordsSetIn(dated(entries[index]), earlier.map(dated), unit),
    })
  }
  return results
}

const RECORD_LABEL = { weight: "weight", reps: "reps", e1rm: "estimated 1RM", volume: "session volume" } as const

/** One concise line about the latest completed workout (new record first, else an improvement). */
export async function getPerformanceHighlight(target: MemberTarget): Promise<PerformanceHighlight | null> {
  await dbReady()
  const latest = await WorkoutSession.findOne(scopeToTarget(target, { status: "COMPLETED" }))
    .sort({ date: -1, startedAt: -1 })
    .select("_id")
    .lean<{ _id: Types.ObjectId }>()
  if (!latest) return null
  const performance = (await getSessionPerformance(target, latest._id.toString())).slice(0, 8)

  const pr = performance.find((p) => p.newRecords.length > 0)
  if (pr) {
    return {
      workoutSessionId: latest._id.toString(),
      exerciseName: pr.exerciseName,
      kind: "PR",
      text: `New personal record in ${RECORD_LABEL[pr.newRecords[0]]}`,
    }
  }
  const better = performance.find((p) => (p.comparison?.bestWeightDiff ?? 0) > 0)
  if (better) {
    return {
      workoutSessionId: latest._id.toString(),
      exerciseName: better.exerciseName,
      kind: "IMPROVED",
      text: `+${better.comparison!.bestWeightDiff} ${better.unit} from the previous comparable session`,
    }
  }
  return null
}
