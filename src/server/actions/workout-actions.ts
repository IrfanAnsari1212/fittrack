"use server"

import { revalidatePath } from "next/cache"

import type { ActionResult, FormState } from "@/lib/form-state"
import { formDataToObject } from "@/lib/validations/common"
import type { AssignMyWorkoutPlanInput, SetLogInput } from "@/lib/validations/workout"
import { toActionError, toFormError } from "@/server/actions/action-utils"
import { requireMember } from "@/server/auth/session"
import { selfTarget } from "@/server/services/nutrition/member-target"
import { assignMyWorkoutPlan, customizeMyWorkoutPlan } from "@/server/services/workout/workout-assignment-service"
import {
  addSetLog,
  discardWorkoutSession,
  finishWorkoutSession,
  getWorkoutDayOverview,
  removeSetLog,
  setExerciseSessionCompleted,
  startWorkoutSession,
  updateSetLog,
} from "@/server/services/workout/workout-session-service"
import type { WorkoutDayOverview } from "@/types/workout"

/*
 * Member workouts. The member is ALWAYS the authenticated user
 * (`requireMember()`); no userId, gymId or plan ownership is read from the
 * request. `date`/`startDate` are the member's local calendar day computed in
 * the browser — validated by the services, never replaced by the server's.
 */

function refresh(sessionId?: string) {
  revalidatePath("/workouts")
  revalidatePath("/workouts/history")
  revalidatePath("/dashboard")
  if (sessionId) revalidatePath(`/workouts/session/${sessionId}`)
}

/** Plan for the day + rotation suggestion + workouts (dashboard widget). */
export async function getWorkoutDayAction(date: string): Promise<ActionResult<WorkoutDayOverview>> {
  const member = await requireMember()
  try {
    return { ok: true, data: await getWorkoutDayOverview(selfTarget(member), date) }
  } catch (error) {
    return toActionError(error)
  }
}

export async function startWorkoutAction(date: string, workoutPlanDayId: string): Promise<ActionResult<{ sessionId: string }>> {
  const member = await requireMember()
  try {
    const { id } = await startWorkoutSession(member, { date, workoutPlanDayId })
    refresh()
    return { ok: true, data: { sessionId: id } }
  } catch (error) {
    return toActionError(error)
  }
}

export async function updateSetAction(sessionId: string, setLogId: string, input: SetLogInput): Promise<ActionResult> {
  const member = await requireMember()
  try {
    await updateSetLog(member, setLogId, {
      weight: input?.weight,
      weightUnit: input?.weightUnit,
      reps: input?.reps,
      completed: input?.completed,
    })
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath(`/workouts/session/${sessionId}`)
  return { ok: true }
}

export async function addSetAction(sessionId: string, exerciseSessionId: string, input: SetLogInput = {}): Promise<ActionResult> {
  const member = await requireMember()
  try {
    await addSetLog(member, exerciseSessionId, {
      weight: input?.weight,
      weightUnit: input?.weightUnit,
      reps: input?.reps,
      completed: input?.completed,
    })
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath(`/workouts/session/${sessionId}`)
  return { ok: true }
}

export async function removeSetAction(sessionId: string, setLogId: string): Promise<ActionResult> {
  const member = await requireMember()
  try {
    await removeSetLog(member, setLogId)
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath(`/workouts/session/${sessionId}`)
  return { ok: true }
}

export async function setExerciseCompletedAction(
  sessionId: string,
  exerciseSessionId: string,
  completed: boolean
): Promise<ActionResult> {
  const member = await requireMember()
  try {
    await setExerciseSessionCompleted(member, exerciseSessionId, completed === true)
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath(`/workouts/session/${sessionId}`)
  return { ok: true }
}

export async function finishWorkoutAction(sessionId: string): Promise<ActionResult> {
  const member = await requireMember()
  try {
    await finishWorkoutSession(member, sessionId)
  } catch (error) {
    return toActionError(error)
  }
  refresh(sessionId)
  return { ok: true }
}

export async function discardWorkoutAction(sessionId: string): Promise<ActionResult> {
  const member = await requireMember()
  try {
    await discardWorkoutSession(member, sessionId)
  } catch (error) {
    return toActionError(error)
  }
  refresh(sessionId)
  return { ok: true }
}

/** Switch to one of MY personal plans from `startDate` (explicit replace rule applies). */
export async function useMyWorkoutPlanAction(
  workoutPlanId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const member = await requireMember()
  const values = formDataToObject(formData)
  try {
    // The plan must be the member's own (checked in the service); member id is the session's.
    await assignMyWorkoutPlan(member, { ...values, workoutPlanId } as unknown as AssignMyWorkoutPlanInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh()
  revalidatePath("/workouts/plans", "layout")
  return { success: "This plan is now your active workout plan." }
}

/** Copy my current gym-assigned plan into a personal plan I can edit, from my local `startDate`. */
export async function customizeMyWorkoutPlanAction(startDate: string): Promise<ActionResult<{ planId: string }>> {
  const member = await requireMember()
  let planId: string
  try {
    ;({ planId } = await customizeMyWorkoutPlan(member, { startDate }))
  } catch (error) {
    return toActionError(error)
  }
  refresh()
  revalidatePath("/workouts/plans", "layout")
  return { ok: true, data: { planId } }
}
