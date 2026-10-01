import type { Types } from "mongoose"

import { exerciseSchema, objectIdSchema, type ExerciseInput } from "@/lib/validations/workout"
import { EXERCISE_CATEGORIES, MUSCLE_GROUPS, type ExerciseCategory, type MuscleGroup } from "@/lib/workout/constants"
import { assertGymAdmin, assertGymUser } from "@/server/auth/guards"
import { dbReady } from "@/server/db"
import { DomainError, parseInput } from "@/server/errors"
import { Exercise } from "@/server/models/exercise"
import { scopeToGym } from "@/server/tenant"
import type { GymAdminUser, GymUser } from "@/types/auth"
import type { ExerciseView } from "@/types/workout"

/**
 * The gym's exercise library. Gym Admins manage it; members of the same gym
 * can read ACTIVE exercises (to build personal plans). Members cannot create
 * exercises. Every query is scoped to the caller's gym.
 */

export interface ExerciseRecord {
  _id: Types.ObjectId
  name: string
  description?: string | null
  muscleGroup: MuscleGroup
  equipment?: string | null
  category: ExerciseCategory
  status: "ACTIVE" | "ARCHIVED"
}

export function toExerciseView(e: ExerciseRecord): ExerciseView {
  return {
    id: e._id.toString(),
    name: e.name,
    description: e.description ?? null,
    muscleGroup: e.muscleGroup,
    equipment: e.equipment ?? null,
    category: e.category,
    status: e.status,
  }
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export interface ExerciseFilter {
  query?: string
  muscleGroup?: string
  category?: string
  includeArchived?: boolean
}

export async function listExercises(user: GymUser, filter: ExerciseFilter = {}): Promise<ExerciseView[]> {
  assertGymUser(user)
  await dbReady()
  const where: Record<string, unknown> = {}
  // Only admins may see archived exercises.
  if (!(filter.includeArchived && user.role === "GYM_ADMIN")) where.status = "ACTIVE"
  const search = filter.query?.trim().slice(0, 100)
  if (search) where.name = new RegExp(escapeRegex(search), "i")
  // Only whitelisted values reach the query (no operator injection).
  if (filter.muscleGroup && (MUSCLE_GROUPS as readonly string[]).includes(filter.muscleGroup)) {
    where.muscleGroup = filter.muscleGroup
  }
  if (filter.category && (EXERCISE_CATEGORIES as readonly string[]).includes(filter.category)) {
    where.category = filter.category
  }
  const exercises = await Exercise.find(scopeToGym(user, where)).sort({ name: 1 }).limit(500).lean<ExerciseRecord[]>()
  return exercises.map(toExerciseView)
}

export async function createExercise(admin: GymAdminUser, input: ExerciseInput): Promise<ExerciseView> {
  assertGymAdmin(admin)
  const data = parseInput(exerciseSchema, input)
  await dbReady()
  const exercise = await Exercise.create({ ...data, gymId: admin.gymId, status: "ACTIVE" })
  return toExerciseView(exercise.toObject() as ExerciseRecord)
}

/** Renaming/editing flows into every plan that uses it; past sessions keep their snapshot. */
export async function updateExercise(admin: GymAdminUser, exerciseId: string, input: ExerciseInput): Promise<ExerciseView> {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, exerciseId)
  const data = parseInput(exerciseSchema, input)
  await dbReady()
  const exercise = await Exercise.findOneAndUpdate(
    scopeToGym(admin, { _id: id }),
    { $set: data },
    { returnDocument: "after", runValidators: true }
  ).lean<ExerciseRecord>()
  if (!exercise) throw new DomainError("NOT_FOUND")
  return toExerciseView(exercise)
}

export async function setExerciseArchived(admin: GymAdminUser, exerciseId: string, archived: boolean): Promise<void> {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, exerciseId)
  await dbReady()
  const result = await Exercise.updateOne(scopeToGym(admin, { _id: id }), {
    $set: { status: archived ? "ARCHIVED" : "ACTIVE" },
  })
  if (result.matchedCount === 0) throw new DomainError("NOT_FOUND")
}
