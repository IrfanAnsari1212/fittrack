"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import type { ActionResult, FormState } from "@/lib/form-state"
import { formDataToObject } from "@/lib/validations/common"
import type {
  AddPlannedExerciseInput,
  PlannedExerciseConfigInput,
  WorkoutDayInput,
  WorkoutPlanInput,
} from "@/lib/validations/workout"
import { toActionError, toFormError } from "@/server/actions/action-utils"
import { requireGymUser } from "@/server/auth/session"
import {
  addPlannedExercise,
  addWorkoutDay,
  createWorkoutPlan,
  deleteWorkoutDay,
  removePlannedExercise,
  reorderPlannedExercises,
  reorderWorkoutDays,
  setWorkoutPlanArchived,
  updatePlannedExercise,
  updateWorkoutDay,
  updateWorkoutPlan,
  type PlanEditor,
} from "@/server/services/workout/workout-plan-service"

/*
 * Workout-plan builder, shared by Gym Admins (gym plans) and Members (their
 * own personal plans). WHICH plans the caller may touch is decided by the
 * workout-plan service from the authenticated role; these actions only
 * authenticate, delegate and refresh. Ownership/createdBy come from the
 * session, never the input; bound ids are re-verified by the service.
 */

const ADMIN_PLANS = "/admin/workouts"
const MEMBER_PLANS = "/workouts/plans"

function planPath(editor: { role: string }, planId: string) {
  return `${editor.role === "GYM_ADMIN" ? ADMIN_PLANS : MEMBER_PLANS}/${planId}`
}

function refresh(planId?: string) {
  for (const base of [ADMIN_PLANS, MEMBER_PLANS]) {
    revalidatePath(base)
    if (planId) revalidatePath(`${base}/${planId}`)
  }
  revalidatePath("/workouts")
}

export async function createWorkoutPlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const editor = await requireGymUser()
  const values = formDataToObject(formData)
  let id: string
  try {
    ;({ id } = await createWorkoutPlan(editor as PlanEditor, values as unknown as WorkoutPlanInput))
  } catch (error) {
    return toFormError(error, values)
  }
  refresh()
  redirect(planPath(editor, id))
}

export async function updateWorkoutPlanAction(planId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const editor = await requireGymUser()
  const values = formDataToObject(formData)
  try {
    await updateWorkoutPlan(editor as PlanEditor, planId, values as unknown as WorkoutPlanInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh(planId)
  return { success: "Plan details saved.", values }
}

export async function setWorkoutPlanArchivedAction(planId: string, archived: boolean): Promise<ActionResult> {
  const editor = await requireGymUser()
  try {
    await setWorkoutPlanArchived(editor as PlanEditor, planId, archived === true)
  } catch (error) {
    return toActionError(error)
  }
  refresh(planId)
  return { ok: true }
}

// ── Workout days ─────────────────────────────────────────────────────────

export async function addWorkoutDayAction(planId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const editor = await requireGymUser()
  const values = formDataToObject(formData)
  try {
    await addWorkoutDay(editor as PlanEditor, planId, values as unknown as WorkoutDayInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh(planId)
  return { success: "Workout day added." }
}

export async function updateWorkoutDayAction(
  planId: string,
  dayId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const editor = await requireGymUser()
  const values = formDataToObject(formData)
  try {
    await updateWorkoutDay(editor as PlanEditor, dayId, values as unknown as WorkoutDayInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh(planId)
  return { success: "Workout day saved." }
}

export async function deleteWorkoutDayAction(planId: string, dayId: string): Promise<ActionResult> {
  const editor = await requireGymUser()
  try {
    await deleteWorkoutDay(editor as PlanEditor, dayId)
  } catch (error) {
    return toActionError(error)
  }
  refresh(planId)
  return { ok: true }
}

export async function reorderWorkoutDaysAction(planId: string, dayIds: string[]): Promise<ActionResult> {
  const editor = await requireGymUser()
  try {
    await reorderWorkoutDays(editor as PlanEditor, planId, dayIds)
  } catch (error) {
    return toActionError(error)
  }
  refresh(planId)
  return { ok: true }
}

// ── Planned exercises ────────────────────────────────────────────────────

export async function addPlannedExerciseAction(
  planId: string,
  dayId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const editor = await requireGymUser()
  const values = formDataToObject(formData)
  try {
    await addPlannedExercise(editor as PlanEditor, dayId, values as unknown as AddPlannedExerciseInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh(planId)
  return { success: "Exercise added." }
}

export async function updatePlannedExerciseAction(
  planId: string,
  plannedExerciseId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const editor = await requireGymUser()
  const values = formDataToObject(formData)
  try {
    await updatePlannedExercise(editor as PlanEditor, plannedExerciseId, values as unknown as PlannedExerciseConfigInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh(planId)
  return { success: "Exercise updated." }
}

export async function removePlannedExerciseAction(planId: string, plannedExerciseId: string): Promise<ActionResult> {
  const editor = await requireGymUser()
  try {
    await removePlannedExercise(editor as PlanEditor, plannedExerciseId)
  } catch (error) {
    return toActionError(error)
  }
  refresh(planId)
  return { ok: true }
}

export async function reorderPlannedExercisesAction(
  planId: string,
  dayId: string,
  plannedExerciseIds: string[]
): Promise<ActionResult> {
  const editor = await requireGymUser()
  try {
    await reorderPlannedExercises(editor as PlanEditor, dayId, plannedExerciseIds)
  } catch (error) {
    return toActionError(error)
  }
  refresh(planId)
  return { ok: true }
}
