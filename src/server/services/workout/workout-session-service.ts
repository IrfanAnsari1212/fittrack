import type mongoose from "mongoose"
import { Types } from "mongoose"

import {
  historyFilterSchema,
  objectIdSchema,
  setLogSchema,
  startWorkoutSchema,
  calendarDateSchema,
  type HistoryFilterInput,
  type SetLogInput,
  type StartWorkoutInput,
} from "@/lib/validations/workout"
import type { SessionStatus, WeightUnit } from "@/lib/workout/constants"
import { dbReady } from "@/server/db"
import { inTransaction } from "@/server/db/transaction"
import { DomainError, parseInput, ValidationError } from "@/server/errors"
import { Exercise } from "@/server/models/exercise"
import { ExerciseSession } from "@/server/models/exercise-session"
import { SetLog } from "@/server/models/set-log"
import { WorkoutPlan } from "@/server/models/workout-plan"
import { WorkoutPlanAssignment } from "@/server/models/workout-plan-assignment"
import { WorkoutPlanDay } from "@/server/models/workout-plan-day"
import { WorkoutPlanExercise } from "@/server/models/workout-plan-exercise"
import { WorkoutSession } from "@/server/models/workout-session"
import { scopeToGym } from "@/server/tenant"
import { scopeToTarget, selfTarget, type MemberTarget } from "@/server/services/nutrition/member-target"
import { getWorkoutPlanForDate } from "@/server/services/workout/workout-assignment-service"
import type { MemberUser } from "@/types/auth"
import type {
  ExerciseSessionView,
  SetLogView,
  WorkoutDayOverview,
  WorkoutPlanDetail,
  WorkoutSessionView,
} from "@/types/workout"

/*
 * ACTUAL workouts: WorkoutSession → ExerciseSession → SetLog.
 *
 * These never write to the plan (WorkoutPlan/Day/Exercise): performing 85 kg
 * × 6 against a planned 80 kg × 8 changes nothing about the plan. Each
 * ExerciseSession keeps an immutable snapshot of the prescription it came
 * from, so planned-vs-actual can be analysed later (Module 5).
 *
 * Only the member themselves can log (`selfTarget`); admins read history via
 * a `gymMemberTarget`. Calendar days come from the caller; `startedAt` /
 * `completedAt` are real instants (not calendar days).
 */

const MAX_SETS_PER_EXERCISE = 50

interface SessionRecord {
  _id: Types.ObjectId
  userId: Types.ObjectId
  date: string
  workoutPlanId: Types.ObjectId
  workoutPlanDayId: Types.ObjectId
  planName: string
  dayName: string
  status: SessionStatus
  startedAt: Date
  completedAt?: Date | null
  durationSeconds?: number | null
}

interface ExerciseSessionRecord {
  _id: Types.ObjectId
  workoutSessionId: Types.ObjectId
  exerciseId: Types.ObjectId
  exerciseName: string
  muscleGroup: string
  order: number
  completed: boolean
  planned: ExerciseSessionView["planned"]
}

interface SetLogRecord {
  _id: Types.ObjectId
  workoutSessionId: Types.ObjectId
  exerciseSessionId: Types.ObjectId
  exerciseId: Types.ObjectId
  setNumber: number
  weight?: number | null
  weightUnit: WeightUnit
  reps?: number | null
  completed: boolean
  completedAt?: Date | null
}

const toSetView = (s: SetLogRecord): SetLogView => ({
  id: s._id.toString(),
  setNumber: s.setNumber,
  weight: s.weight ?? null,
  weightUnit: s.weightUnit,
  reps: s.reps ?? null,
  completed: s.completed,
})

/** Assemble session views (exercises + sets) for already-scoped session records. */
async function toSessionViews(target: MemberTarget, sessions: SessionRecord[]): Promise<WorkoutSessionView[]> {
  if (sessions.length === 0) return []
  const ids = sessions.map((s) => s._id)
  const [exercises, sets] = await Promise.all([
    ExerciseSession.find(scopeToTarget(target, { workoutSessionId: { $in: ids } }))
      .sort({ order: 1 })
      .lean<ExerciseSessionRecord[]>(),
    SetLog.find(scopeToTarget(target, { workoutSessionId: { $in: ids } }))
      .sort({ setNumber: 1 })
      .lean<SetLogRecord[]>(),
  ])
  return sessions.map((s) => ({
    id: s._id.toString(),
    memberId: s.userId.toString(),
    date: s.date,
    planName: s.planName,
    dayName: s.dayName,
    status: s.status,
    startedAt: s.startedAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
    durationSeconds: s.durationSeconds ?? null,
    exercises: exercises
      .filter((e) => e.workoutSessionId.equals(s._id))
      .map((e) => ({
        id: e._id.toString(),
        exerciseId: e.exerciseId.toString(),
        exerciseName: e.exerciseName,
        muscleGroup: e.muscleGroup,
        order: e.order,
        completed: e.completed,
        planned: e.planned,
        sets: sets.filter((set) => set.exerciseSessionId.equals(e._id)).map(toSetView),
      })),
  }))
}

// ── Starting a workout ───────────────────────────────────────────────────

/**
 * Start a workout from one day of the plan that applies to the member on
 * `date`. Creates the session, one ExerciseSession per planned exercise
 * (with a snapshot of its prescription) and EMPTY set rows (one per planned
 * set — no actual values are pre-filled from the plan). One workout may be in
 * progress at a time.
 */
export async function startWorkoutSession(member: MemberUser, input: StartWorkoutInput): Promise<{ id: string }> {
  const target = selfTarget(member)
  const data = parseInput(startWorkoutSchema, input)
  const scope = { gymId: target.gymId }

  const id = await inTransaction(async (session) => {
    if (await WorkoutSession.exists(scopeToTarget(target, { status: "IN_PROGRESS" })).session(session)) {
      throw new DomainError("SESSION_IN_PROGRESS")
    }
    // The plan comes from the member's own assignment for that day — never from the client.
    const assignment = await WorkoutPlanAssignment.findOne(
      scopeToTarget(target, {
        startDate: { $lte: data.date },
        $or: [{ endDate: null }, { endDate: { $gte: data.date } }],
      })
    )
      .sort({ startDate: -1, createdAt: -1 })
      .session(session)
      .lean<{ workoutPlanId: Types.ObjectId }>()
    if (!assignment) throw new DomainError("NOT_FOUND")

    const plan = await WorkoutPlan.findOne(scopeToGym(scope, { _id: assignment.workoutPlanId }))
      .select("name")
      .session(session)
      .lean<{ _id: Types.ObjectId; name: string }>()
    const day = await WorkoutPlanDay.findOne(
      scopeToGym(scope, { _id: data.workoutPlanDayId, workoutPlanId: assignment.workoutPlanId })
    )
      .session(session)
      .lean<{ _id: Types.ObjectId; name: string }>()
    if (!plan || !day) throw new DomainError("NOT_FOUND")

    const items = await WorkoutPlanExercise.find(scopeToGym(scope, { workoutPlanDayId: day._id }))
      .sort({ order: 1 })
      .session(session)
      .lean<
        {
          _id: Types.ObjectId
          exerciseId: Types.ObjectId
          sets: number
          repsMin: number
          repsMax?: number | null
          targetWeight?: number | null
          weightUnit: WeightUnit
          restSeconds?: number | null
          notes?: string | null
        }[]
      >()
    if (items.length === 0) {
      throw new ValidationError({ workoutPlanDayId: ["This workout has no exercises yet"] })
    }
    const exercises = await Exercise.find(scopeToGym(scope, { _id: { $in: items.map((i) => i.exerciseId) } }))
      .select("name muscleGroup")
      .session(session)
      .lean<{ _id: Types.ObjectId; name: string; muscleGroup: string }[]>()
    const exerciseById = new Map(exercises.map((e) => [e._id.toString(), e]))

    const [workout] = await WorkoutSession.create(
      [
        {
          gymId: target.gymId,
          userId: target.memberId,
          date: data.date,
          workoutPlanId: plan._id,
          workoutPlanDayId: day._id,
          planName: plan.name,
          dayName: day.name,
          status: "IN_PROGRESS",
          startedAt: new Date(),
        },
      ],
      { session }
    )

    const exerciseSessions: Record<string, unknown>[] = []
    const setLogs: Record<string, unknown>[] = []
    for (const [index, item] of items.entries()) {
      const exercise = exerciseById.get(item.exerciseId.toString())
      if (!exercise) continue
      const _id = new Types.ObjectId()
      exerciseSessions.push({
        _id,
        gymId: target.gymId,
        userId: target.memberId,
        workoutSessionId: workout._id,
        exerciseId: item.exerciseId,
        exerciseName: exercise.name,
        muscleGroup: exercise.muscleGroup,
        plannedExerciseId: item._id,
        order: index,
        planned: {
          sets: item.sets,
          repsMin: item.repsMin,
          repsMax: item.repsMax ?? null,
          targetWeight: item.targetWeight ?? null,
          weightUnit: item.weightUnit,
          restSeconds: item.restSeconds ?? null,
          notes: item.notes ?? null,
        },
        completed: false,
      })
      for (let n = 1; n <= item.sets; n++) {
        setLogs.push({
          gymId: target.gymId,
          userId: target.memberId,
          workoutSessionId: workout._id,
          exerciseSessionId: _id,
          exerciseId: item.exerciseId,
          date: data.date,
          setNumber: n,
          weight: null,
          weightUnit: item.weightUnit,
          reps: null,
          completed: false,
        })
      }
    }
    if (exerciseSessions.length === 0) throw new ValidationError({ workoutPlanDayId: ["This workout has no usable exercises"] })
    await ExerciseSession.insertMany(exerciseSessions, { session })
    await SetLog.insertMany(setLogs, { session })
    return workout._id.toString()
  })
  return { id }
}

// ── Reading ──────────────────────────────────────────────────────────────

export async function getWorkoutSession(target: MemberTarget, sessionId: string): Promise<WorkoutSessionView | null> {
  const id = parseInput(objectIdSchema, sessionId)
  await dbReady()
  const record = await WorkoutSession.findOne(scopeToTarget(target, { _id: id })).lean<SessionRecord>()
  if (!record) return null
  const [view] = await toSessionViews(target, [record])
  return view
}

/** Completed workouts, newest day first. `from`/`to` are caller-supplied calendar days. */
export async function listWorkoutHistory(target: MemberTarget, filter: HistoryFilterInput = {}): Promise<WorkoutSessionView[]> {
  const { from, to, limit } = parseInput(historyFilterSchema, filter)
  await dbReady()
  const range: Record<string, string> = {}
  if (from) range.$gte = from
  if (to) range.$lte = to
  const records = await WorkoutSession.find(
    scopeToTarget(target, { status: "COMPLETED", ...(from || to ? { date: range } : {}) })
  )
    .sort({ date: -1, startedAt: -1 })
    .limit(limit)
    .lean<SessionRecord[]>()
  return toSessionViews(target, records)
}

/** The plan day that follows the member's last completed one (cyclic); the first day if none. */
async function suggestNextDayId(target: MemberTarget, plan: WorkoutPlanDetail): Promise<string | null> {
  const days = plan.days.filter((d) => d.exercises.length > 0)
  if (days.length === 0) return null
  const last = await WorkoutSession.findOne(
    scopeToTarget(target, { workoutPlanId: plan.id, status: "COMPLETED" })
  )
    .sort({ startedAt: -1 })
    .select("workoutPlanDayId")
    .lean<{ workoutPlanDayId: Types.ObjectId }>()
  const index = last ? days.findIndex((d) => d.id === last.workoutPlanDayId.toString()) : -1
  return days[(index + 1) % days.length].id
}

/**
 * Everything the member sees for one calendar day: the plan that applies,
 * which day is next in the rotation, any workout in progress, and workouts
 * already completed that day. `date` is the member's local day (caller-supplied).
 */
export async function getWorkoutDayOverview(target: MemberTarget, date: string): Promise<WorkoutDayOverview> {
  const day = parseInput(calendarDateSchema, date)
  await dbReady()
  const [planForDate, inProgressRecord, completedRecords] = await Promise.all([
    getWorkoutPlanForDate(target, day),
    WorkoutSession.findOne(scopeToTarget(target, { status: "IN_PROGRESS" })).lean<SessionRecord>(),
    WorkoutSession.find(scopeToTarget(target, { status: "COMPLETED", date: day }))
      .sort({ startedAt: 1 })
      .lean<SessionRecord[]>(),
  ])
  const [views, suggestedDayId] = await Promise.all([
    toSessionViews(target, [...(inProgressRecord ? [inProgressRecord] : []), ...completedRecords]),
    planForDate ? suggestNextDayId(target, planForDate.plan) : Promise.resolve(null),
  ])
  return {
    date: day,
    plan: planForDate,
    suggestedDayId,
    inProgress: inProgressRecord ? views[0] : null,
    completedToday: inProgressRecord ? views.slice(1) : views,
  }
}

// ── Logging sets ─────────────────────────────────────────────────────────

async function requireOpenSession(
  target: MemberTarget,
  workoutSessionId: Types.ObjectId | string,
  session?: mongoose.ClientSession
) {
  const record = await WorkoutSession.findOne(scopeToTarget(target, { _id: workoutSessionId }))
    .session(session ?? null)
    .lean<SessionRecord>()
  if (!record) throw new DomainError("NOT_FOUND")
  if (record.status !== "IN_PROGRESS") throw new DomainError("SESSION_CLOSED")
  return record
}

async function requireOwnSet(target: MemberTarget, setLogId: string, session?: mongoose.ClientSession) {
  const set = await SetLog.findOne(scopeToTarget(target, { _id: setLogId }))
    .session(session ?? null)
    .lean<SetLogRecord>()
  if (!set) throw new DomainError("NOT_FOUND")
  await requireOpenSession(target, set.workoutSessionId, session)
  return set
}

/** Add another set to an exercise of MY in-progress workout. */
export async function addSetLog(member: MemberUser, exerciseSessionId: string, input: SetLogInput = {}): Promise<{ id: string }> {
  const target = selfTarget(member)
  const id = parseInput(objectIdSchema, exerciseSessionId)
  const data = parseInput(setLogSchema, input)
  await dbReady()
  const exercise = await ExerciseSession.findOne(scopeToTarget(target, { _id: id })).lean<
    ExerciseSessionRecord & { workoutSessionId: Types.ObjectId }
  >()
  if (!exercise) throw new DomainError("NOT_FOUND")
  const workout = await requireOpenSession(target, exercise.workoutSessionId)
  const existing = await SetLog.find(scopeToTarget(target, { exerciseSessionId: exercise._id }))
    .select("setNumber")
    .lean<{ setNumber: number }[]>()
  if (existing.length >= MAX_SETS_PER_EXERCISE) {
    throw new ValidationError({ form: [`At most ${MAX_SETS_PER_EXERCISE} sets per exercise`] })
  }
  const set = await SetLog.create({
    gymId: target.gymId,
    userId: target.memberId,
    workoutSessionId: workout._id,
    exerciseSessionId: exercise._id,
    exerciseId: exercise.exerciseId,
    date: workout.date,
    setNumber: Math.max(0, ...existing.map((s) => s.setNumber)) + 1,
    weight: data.weight,
    weightUnit: data.weightUnit,
    reps: data.reps,
    completed: data.completed,
    completedAt: data.completed ? new Date() : null,
  })
  return { id: set._id.toString() }
}

/** Record (or change) the ACTUAL weight/reps of one set, and whether it's done. */
export async function updateSetLog(member: MemberUser, setLogId: string, input: SetLogInput) {
  const target = selfTarget(member)
  const id = parseInput(objectIdSchema, setLogId)
  const data = parseInput(setLogSchema, input)
  await dbReady()
  const set = await requireOwnSet(target, id)
  await SetLog.updateOne(
    scopeToTarget(target, { _id: id }),
    {
      $set: {
        weight: data.weight,
        weightUnit: data.weightUnit,
        reps: data.reps,
        completed: data.completed,
        // A real instant, kept if the set was already completed.
        completedAt: data.completed ? (set.completedAt ?? new Date()) : null,
      },
    },
    { runValidators: true }
  )
}

export async function removeSetLog(member: MemberUser, setLogId: string) {
  const target = selfTarget(member)
  const id = parseInput(objectIdSchema, setLogId)
  await dbReady()
  await inTransaction(async (session) => {
    const set = await requireOwnSet(target, id, session)
    await SetLog.deleteOne(scopeToTarget(target, { _id: id })).session(session)
    // Keep set numbers sequential.
    const rest = await SetLog.find(scopeToTarget(target, { exerciseSessionId: set.exerciseSessionId }))
      .sort({ setNumber: 1 })
      .session(session)
      .lean<SetLogRecord[]>()
    for (const [index, s] of rest.entries()) {
      if (s.setNumber !== index + 1) {
        await SetLog.updateOne(scopeToTarget(target, { _id: s._id }), { $set: { setNumber: index + 1 } }).session(session)
      }
    }
  })
}

/** Mark an exercise of MY in-progress workout done (or not). Does not touch its sets. */
export async function setExerciseSessionCompleted(member: MemberUser, exerciseSessionId: string, completed: boolean) {
  const target = selfTarget(member)
  const id = parseInput(objectIdSchema, exerciseSessionId)
  await dbReady()
  const exercise = await ExerciseSession.findOne(scopeToTarget(target, { _id: id })).lean<ExerciseSessionRecord>()
  if (!exercise) throw new DomainError("NOT_FOUND")
  await requireOpenSession(target, exercise.workoutSessionId)
  await ExerciseSession.updateOne(scopeToTarget(target, { _id: id }), { $set: { completed: completed === true } })
}

// ── Finishing ────────────────────────────────────────────────────────────

/**
 * Finish MY in-progress workout. Needs at least one completed set. Sets that
 * were never filled in are dropped (history holds only performed sets) and
 * the duration is computed from the real start/finish instants.
 */
export async function finishWorkoutSession(member: MemberUser, sessionId: string): Promise<{ id: string }> {
  const target = selfTarget(member)
  const id = parseInput(objectIdSchema, sessionId)
  await dbReady()
  await inTransaction(async (session) => {
    const workout = await requireOpenSession(target, id, session)
    const done = await SetLog.countDocuments(scopeToTarget(target, { workoutSessionId: workout._id, completed: true })).session(session)
    if (done === 0) throw new DomainError("EMPTY_SESSION")
    await SetLog.deleteMany(scopeToTarget(target, { workoutSessionId: workout._id, completed: false })).session(session)
    const completedAt = new Date()
    await WorkoutSession.updateOne(scopeToTarget(target, { _id: workout._id, status: "IN_PROGRESS" }), {
      $set: {
        status: "COMPLETED",
        completedAt,
        durationSeconds: Math.max(0, Math.round((completedAt.getTime() - workout.startedAt.getTime()) / 1000)),
      },
    }).session(session)
  })
  return { id }
}

/** Throw away MY in-progress workout (and everything logged in it). */
export async function discardWorkoutSession(member: MemberUser, sessionId: string) {
  const target = selfTarget(member)
  const id = parseInput(objectIdSchema, sessionId)
  await dbReady()
  await inTransaction(async (session) => {
    const workout = await requireOpenSession(target, id, session)
    await SetLog.deleteMany(scopeToTarget(target, { workoutSessionId: workout._id })).session(session)
    await ExerciseSession.deleteMany(scopeToTarget(target, { workoutSessionId: workout._id })).session(session)
    await WorkoutSession.deleteOne(scopeToTarget(target, { _id: workout._id })).session(session)
  })
}
