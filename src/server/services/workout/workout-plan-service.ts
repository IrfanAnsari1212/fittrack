import type mongoose from "mongoose"
import { Types } from "mongoose"

import {
  addPlannedExerciseSchema,
  objectIdSchema,
  plannedExerciseConfigSchema,
  reorderIdsSchema,
  targetWeightSchema,
  workoutDaySchema,
  workoutPlanSchema,
  type AddPlannedExerciseInput,
  type PlannedExerciseConfigInput,
  type TargetWeightInput,
  type WorkoutDayInput,
  type WorkoutPlanInput,
} from "@/lib/validations/workout"
import type { MuscleGroup, WeightUnit } from "@/lib/workout/constants"
import { ForbiddenError } from "@/server/auth/guards"
import { dbReady } from "@/server/db"
import { inTransaction } from "@/server/db/transaction"
import { DomainError, parseInput } from "@/server/errors"
import { Exercise } from "@/server/models/exercise"
import { WorkoutPlan } from "@/server/models/workout-plan"
import { WorkoutPlanDay } from "@/server/models/workout-plan-day"
import { WorkoutPlanExercise } from "@/server/models/workout-plan-exercise"
import { scopeToGym, type TenantScope } from "@/server/tenant"
import type { ExerciseRecord } from "@/server/services/workout/exercise-service"
import type { GymAdminUser, MemberUser } from "@/types/auth"
import type { PlannedExerciseView, WorkoutDayView, WorkoutPlanDetail, WorkoutPlanSummary } from "@/types/workout"

/**
 * Workout plans (planned training). Same ownership model as diet plans:
 *  - GYM plans (ownerUserId = null): the gym's library, edited by Gym Admins
 *    and assignable to any member of the gym.
 *  - PERSONAL plans (ownerUserId = a member): edited only by that member and
 *    only ever assigned to them.
 *
 * Editing functions take a `PlanEditor` and derive the scope from its role
 * (`editorScope`), so a member can never reach — let alone mutate — a shared
 * gym plan: it is "not found" from their side. Days and planned exercises
 * are reached through their plan, so the same rule covers them. Archived
 * plans are read-only.
 */

export type PlanEditor = GymAdminUser | MemberUser

type PlanStatus = "ACTIVE" | "ARCHIVED"

interface PlanRecord {
  _id: Types.ObjectId
  gymId: Types.ObjectId
  name: string
  description?: string | null
  status: PlanStatus
  ownerUserId?: Types.ObjectId | null
  sourcePlanId?: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

interface DayRecord {
  _id: Types.ObjectId
  workoutPlanId: Types.ObjectId
  name: string
  description?: string | null
  order: number
}

export interface PlannedExerciseRecord {
  _id: Types.ObjectId
  workoutPlanId: Types.ObjectId
  workoutPlanDayId: Types.ObjectId
  exerciseId: Types.ObjectId
  order: number
  sets: number
  repsMin: number
  repsMax?: number | null
  targetWeight?: number | null
  weightUnit: WeightUnit
  restSeconds?: number | null
  notes?: string | null
}

interface EditorScope extends TenantScope {
  /** null = gym plans (admins); a member id = that member's personal plans. */
  ownerUserId: string | null
}

function editorScope(editor: PlanEditor): EditorScope {
  if (editor?.role === "GYM_ADMIN" && editor.gymId) return { gymId: editor.gymId, ownerUserId: null }
  if (editor?.role === "MEMBER" && editor.gymId) return { gymId: editor.gymId, ownerUserId: editor.id }
  throw new ForbiddenError()
}

function planFilter<F extends object>(scope: EditorScope, filter?: F) {
  return scopeToGym(scope, {
    ...filter,
    ownerUserId: scope.ownerUserId ? new Types.ObjectId(scope.ownerUserId) : null,
  })
}

async function requireEditablePlan(scope: EditorScope, planId: string, session?: mongoose.ClientSession) {
  const plan = await WorkoutPlan.findOne(planFilter(scope, { _id: planId }))
    .session(session ?? null)
    .lean<PlanRecord>()
  if (!plan) throw new DomainError("NOT_FOUND")
  if (plan.status !== "ACTIVE") throw new DomainError("PLAN_ARCHIVED")
  return plan
}

async function requireEditableDay(scope: EditorScope, dayId: string, session?: mongoose.ClientSession) {
  const day = await WorkoutPlanDay.findOne(scopeToGym(scope, { _id: dayId }))
    .session(session ?? null)
    .lean<DayRecord>()
  if (!day) throw new DomainError("NOT_FOUND")
  await requireEditablePlan(scope, day.workoutPlanId.toString(), session)
  return day
}

async function requireEditablePlannedExercise(scope: EditorScope, id: string) {
  const item = await WorkoutPlanExercise.findOne(scopeToGym(scope, { _id: id })).lean<PlannedExerciseRecord>()
  if (!item) throw new DomainError("NOT_FOUND")
  await requireEditablePlan(scope, item.workoutPlanId.toString())
  return item
}

/** An ACTIVE exercise of the editor's gym. */
async function requireUsableExercise(scope: TenantScope, exerciseId: string) {
  const exercise = await Exercise.findOne(scopeToGym(scope, { _id: exerciseId })).lean<ExerciseRecord>()
  if (!exercise) throw new DomainError("NOT_FOUND")
  if (exercise.status !== "ACTIVE") throw new DomainError("EXERCISE_ARCHIVED")
  return exercise
}

// ── Plans ────────────────────────────────────────────────────────────────

/** Admin → a gym plan; Member → a personal plan owned by them. */
export async function createWorkoutPlan(editor: PlanEditor, input: WorkoutPlanInput): Promise<{ id: string }> {
  const scope = editorScope(editor)
  const data = parseInput(workoutPlanSchema, input)
  await dbReady()
  const plan = await WorkoutPlan.create({
    name: data.name,
    description: data.description,
    gymId: scope.gymId,
    ownerUserId: scope.ownerUserId,
    createdBy: editor.id,
    status: "ACTIVE",
  })
  return { id: plan._id.toString() }
}

export async function updateWorkoutPlan(editor: PlanEditor, planId: string, input: WorkoutPlanInput) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, planId)
  const data = parseInput(workoutPlanSchema, input)
  await dbReady()
  await requireEditablePlan(scope, id)
  await WorkoutPlan.updateOne(
    planFilter(scope, { _id: id }),
    { $set: { name: data.name, description: data.description } },
    { runValidators: true }
  )
}

/** Archive/restore. Existing assignments are kept; edits and new assignments are blocked. */
export async function setWorkoutPlanArchived(editor: PlanEditor, planId: string, archived: boolean) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, planId)
  await dbReady()
  const result = await WorkoutPlan.updateOne(planFilter(scope, { _id: id }), {
    $set: { status: archived ? "ARCHIVED" : "ACTIVE" },
  })
  if (result.matchedCount === 0) throw new DomainError("NOT_FOUND")
}

async function summarize(gymId: string, plans: PlanRecord[]): Promise<WorkoutPlanSummary[]> {
  if (plans.length === 0) return []
  // Aggregations bypass the query guard, so gymId is matched explicitly.
  const counts = await WorkoutPlanDay.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { gymId: new Types.ObjectId(gymId), workoutPlanId: { $in: plans.map((p) => p._id) } } },
    { $group: { _id: "$workoutPlanId", count: { $sum: 1 } } },
  ])
  const countById = new Map(counts.map((c) => [c._id.toString(), c.count]))
  return plans.map((plan) => ({
    id: plan._id.toString(),
    name: plan.name,
    description: plan.description ?? null,
    status: plan.status,
    dayCount: countById.get(plan._id.toString()) ?? 0,
    updatedAt: plan.updatedAt.toISOString(),
  }))
}

/** Admin → the gym library; Member → their own personal plans. */
export async function listWorkoutPlans(
  editor: PlanEditor,
  { status }: { status?: PlanStatus } = {}
): Promise<WorkoutPlanSummary[]> {
  const scope = editorScope(editor)
  await dbReady()
  const plans = await WorkoutPlan.find(planFilter(scope, status ? { status } : {}))
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean<PlanRecord[]>()
  return summarize(scope.gymId, plans)
}

/**
 * Full plan with days and planned exercises. Internal: `scope` must come from
 * an authenticated context; `extra` narrows it further.
 */
export async function loadWorkoutPlanDetail(
  scope: TenantScope,
  planId: string,
  extra: Record<string, unknown> = {}
): Promise<WorkoutPlanDetail | null> {
  await dbReady()
  const plan = await WorkoutPlan.findOne(scopeToGym(scope, { ...extra, _id: planId })).lean<PlanRecord>()
  if (!plan) return null

  const [days, items] = await Promise.all([
    WorkoutPlanDay.find(scopeToGym(scope, { workoutPlanId: plan._id })).sort({ order: 1 }).lean<DayRecord[]>(),
    WorkoutPlanExercise.find(scopeToGym(scope, { workoutPlanId: plan._id }))
      .sort({ order: 1 })
      .lean<PlannedExerciseRecord[]>(),
  ])
  const exerciseIds = [...new Set(items.map((i) => i.exerciseId.toString()))]
  const exercises = exerciseIds.length
    ? await Exercise.find(scopeToGym(scope, { _id: { $in: exerciseIds } })).lean<ExerciseRecord[]>()
    : []
  const exerciseById = new Map(exercises.map((e) => [e._id.toString(), e]))

  const dayViews: WorkoutDayView[] = days.map((day) => ({
    id: day._id.toString(),
    name: day.name,
    description: day.description ?? null,
    order: day.order,
    exercises: items
      .filter((i) => i.workoutPlanDayId.equals(day._id))
      .flatMap((i): PlannedExerciseView[] => {
        const exercise = exerciseById.get(i.exerciseId.toString())
        if (!exercise) return []
        return [
          {
            id: i._id.toString(),
            exerciseId: exercise._id.toString(),
            exerciseName: exercise.name,
            exerciseStatus: exercise.status,
            muscleGroup: exercise.muscleGroup as MuscleGroup,
            order: i.order,
            sets: i.sets,
            repsMin: i.repsMin,
            repsMax: i.repsMax ?? null,
            targetWeight: i.targetWeight ?? null,
            weightUnit: i.weightUnit,
            restSeconds: i.restSeconds ?? null,
            notes: i.notes ?? null,
          },
        ]
      }),
  }))

  return {
    id: plan._id.toString(),
    name: plan.name,
    description: plan.description ?? null,
    status: plan.status,
    ownerUserId: plan.ownerUserId?.toString() ?? null,
    sourcePlanId: plan.sourcePlanId?.toString() ?? null,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    days: dayViews,
  }
}

/**
 * Read a plan. Admin → any plan in their gym (gym plans, and members'
 * personal plans read-only); Member → only their own personal plans (a gym
 * plan assigned to them is read through their assignment).
 */
export async function getWorkoutPlanDetail(viewer: PlanEditor, planId: string): Promise<WorkoutPlanDetail | null> {
  const scope = editorScope(viewer)
  const id = parseInput(objectIdSchema, planId)
  if (viewer.role === "GYM_ADMIN") return loadWorkoutPlanDetail(scope, id)
  return loadWorkoutPlanDetail(scope, id, { ownerUserId: new Types.ObjectId(viewer.id) })
}

/**
 * Copy a plan (days and planned exercises, all with NEW ids) into a new
 * PERSONAL plan owned by `memberId`, inside the caller's transaction. The
 * source is only read. Internal: the caller has verified the member may use it.
 */
export async function clonePlanForMember(
  scope: TenantScope,
  sourcePlanId: string,
  memberId: string,
  session: mongoose.ClientSession
): Promise<string> {
  const source = await WorkoutPlan.findOne(scopeToGym(scope, { _id: sourcePlanId })).session(session).lean<PlanRecord>()
  if (!source) throw new DomainError("NOT_FOUND")

  const [copy] = await WorkoutPlan.create(
    [
      {
        gymId: scope.gymId,
        name: `${source.name} (my version)`.slice(0, 120),
        description: source.description ?? null,
        status: "ACTIVE",
        createdBy: memberId,
        ownerUserId: memberId,
        sourcePlanId: source._id,
      },
    ],
    { session }
  )

  const days = await WorkoutPlanDay.find(scopeToGym(scope, { workoutPlanId: source._id })).session(session).lean<DayRecord[]>()
  const dayIdMap = new Map<string, Types.ObjectId>()
  if (days.length) {
    await WorkoutPlanDay.insertMany(
      days.map((d) => {
        const _id = new Types.ObjectId()
        dayIdMap.set(d._id.toString(), _id)
        return { _id, gymId: scope.gymId, workoutPlanId: copy._id, name: d.name, description: d.description ?? null, order: d.order }
      }),
      { session }
    )
  }

  const items = await WorkoutPlanExercise.find(scopeToGym(scope, { workoutPlanId: source._id }))
    .session(session)
    .lean<PlannedExerciseRecord[]>()
  if (items.length) {
    await WorkoutPlanExercise.insertMany(
      items.map((i) => ({
        gymId: scope.gymId,
        workoutPlanId: copy._id,
        workoutPlanDayId: dayIdMap.get(i.workoutPlanDayId.toString()),
        exerciseId: i.exerciseId,
        order: i.order,
        sets: i.sets,
        repsMin: i.repsMin,
        repsMax: i.repsMax ?? null,
        targetWeight: i.targetWeight ?? null,
        weightUnit: i.weightUnit,
        restSeconds: i.restSeconds ?? null,
        notes: i.notes ?? null,
      })),
      { session }
    )
  }
  return copy._id.toString()
}

// ── Days ─────────────────────────────────────────────────────────────────

export async function addWorkoutDay(editor: PlanEditor, planId: string, input: WorkoutDayInput): Promise<{ id: string }> {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, planId)
  const data = parseInput(workoutDaySchema, input)
  await dbReady()
  const plan = await requireEditablePlan(scope, id)
  const last = await WorkoutPlanDay.findOne(scopeToGym(scope, { workoutPlanId: plan._id }))
    .sort({ order: -1 })
    .select("order")
    .lean<{ order: number }>()
  const day = await WorkoutPlanDay.create({
    gymId: scope.gymId,
    workoutPlanId: plan._id,
    name: data.name,
    description: data.description,
    order: (last?.order ?? -1) + 1,
  })
  return { id: day._id.toString() }
}

export async function updateWorkoutDay(editor: PlanEditor, dayId: string, input: WorkoutDayInput) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, dayId)
  const data = parseInput(workoutDaySchema, input)
  await dbReady()
  await requireEditableDay(scope, id)
  await WorkoutPlanDay.updateOne(
    scopeToGym(scope, { _id: id }),
    { $set: { name: data.name, description: data.description } },
    { runValidators: true }
  )
}

/** Deletes the day and its planned exercises together. Past workouts keep their snapshots. */
export async function deleteWorkoutDay(editor: PlanEditor, dayId: string) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, dayId)
  await dbReady()
  await requireEditableDay(scope, id)
  await inTransaction(async (session) => {
    await WorkoutPlanExercise.deleteMany(scopeToGym(scope, { workoutPlanDayId: id })).session(session)
    await WorkoutPlanDay.deleteOne(scopeToGym(scope, { _id: id })).session(session)
  })
}

/** `dayIds` must be exactly the plan's days, in the new order. */
export async function reorderWorkoutDays(editor: PlanEditor, planId: string, dayIds: string[]) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, planId)
  const ordered = parseInput(reorderIdsSchema, dayIds)
  await dbReady()
  await inTransaction(async (session) => {
    const plan = await requireEditablePlan(scope, id, session)
    const existing = await WorkoutPlanDay.find(scopeToGym(scope, { workoutPlanId: plan._id }))
      .select("_id")
      .session(session)
      .lean<{ _id: Types.ObjectId }[]>()
    const existingIds = new Set(existing.map((d) => d._id.toString()))
    const sameSet = existing.length === ordered.length && ordered.every((d) => existingIds.has(d.toLowerCase()))
    if (!sameSet) throw new DomainError("CONFLICT", "Workout list is out of date")
    for (const [order, dayId] of ordered.entries()) {
      await WorkoutPlanDay.updateOne(scopeToGym(scope, { _id: dayId, workoutPlanId: plan._id }), { $set: { order } }).session(session)
    }
  })
}

// ── Planned exercises ────────────────────────────────────────────────────

export async function addPlannedExercise(
  editor: PlanEditor,
  dayId: string,
  input: AddPlannedExerciseInput
): Promise<{ id: string }> {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, dayId)
  const data = parseInput(addPlannedExerciseSchema, input)
  await dbReady()
  const day = await requireEditableDay(scope, id)
  await requireUsableExercise(scope, data.exerciseId)
  const last = await WorkoutPlanExercise.findOne(scopeToGym(scope, { workoutPlanDayId: day._id }))
    .sort({ order: -1 })
    .select("order")
    .lean<{ order: number }>()
  const item = await WorkoutPlanExercise.create({
    gymId: scope.gymId,
    workoutPlanId: day.workoutPlanId, // from the day, not the client
    workoutPlanDayId: day._id,
    exerciseId: data.exerciseId,
    order: (last?.order ?? -1) + 1,
    sets: data.sets,
    repsMin: data.repsMin,
    repsMax: data.repsMax,
    targetWeight: data.targetWeight,
    weightUnit: data.weightUnit,
    restSeconds: data.restSeconds,
    notes: data.notes,
  })
  return { id: item._id.toString() }
}

export async function updatePlannedExercise(editor: PlanEditor, plannedExerciseId: string, input: PlannedExerciseConfigInput) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, plannedExerciseId)
  const data = parseInput(plannedExerciseConfigSchema, input)
  await dbReady()
  await requireEditablePlannedExercise(scope, id)
  await WorkoutPlanExercise.updateOne(scopeToGym(scope, { _id: id }), { $set: data }, { runValidators: true })
}

/**
 * Explicit "use this target weight" (never automatic). Goes through the same
 * role-derived scope as every other edit: a member can only change their OWN
 * personal plan — a shared gym plan is "not found" for them (they customize
 * it first) — and an admin only gym plans. Only the target weight and unit
 * change; sets, reps, rest and notes are left alone, and logged workouts keep
 * their own snapshots.
 */
export async function setPlannedExerciseTargetWeight(editor: PlanEditor, plannedExerciseId: string, input: TargetWeightInput) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, plannedExerciseId)
  const data = parseInput(targetWeightSchema, input)
  await dbReady()
  await requireEditablePlannedExercise(scope, id)
  await WorkoutPlanExercise.updateOne(
    scopeToGym(scope, { _id: id }),
    { $set: { targetWeight: data.targetWeight, weightUnit: data.weightUnit } },
    { runValidators: true }
  )
}

export async function removePlannedExercise(editor: PlanEditor, plannedExerciseId: string) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, plannedExerciseId)
  await dbReady()
  await requireEditablePlannedExercise(scope, id)
  await WorkoutPlanExercise.deleteOne(scopeToGym(scope, { _id: id }))
}

/** `exerciseIds` (planned exercise ids) must be exactly the day's exercises, in the new order. */
export async function reorderPlannedExercises(editor: PlanEditor, dayId: string, plannedExerciseIds: string[]) {
  const scope = editorScope(editor)
  const id = parseInput(objectIdSchema, dayId)
  const ordered = parseInput(reorderIdsSchema, plannedExerciseIds)
  await dbReady()
  await inTransaction(async (session) => {
    const day = await requireEditableDay(scope, id, session)
    const existing = await WorkoutPlanExercise.find(scopeToGym(scope, { workoutPlanDayId: day._id }))
      .select("_id")
      .session(session)
      .lean<{ _id: Types.ObjectId }[]>()
    const existingIds = new Set(existing.map((e) => e._id.toString()))
    const sameSet = existing.length === ordered.length && ordered.every((e) => existingIds.has(e.toLowerCase()))
    if (!sameSet) throw new DomainError("CONFLICT", "Exercise list is out of date")
    for (const [order, itemId] of ordered.entries()) {
      await WorkoutPlanExercise.updateOne(scopeToGym(scope, { _id: itemId, workoutPlanDayId: day._id }), { $set: { order } }).session(session)
    }
  })
}
