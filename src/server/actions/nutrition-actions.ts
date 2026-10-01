"use server"

import { revalidatePath } from "next/cache"

import type { ActionResult, FormState } from "@/lib/form-state"
import { formDataToObject } from "@/lib/validations/common"
import type { AssignMyDietPlanInput, LogConsumptionInput, NutritionGoalInput } from "@/lib/validations/nutrition"
import { toActionError, toFormError } from "@/server/actions/action-utils"
import { requireMember } from "@/server/auth/session"
import { assignMyDietPlan, customizeMyDietPlan } from "@/server/services/nutrition/assignment-service"
import {
  getOrCreateDailyNutritionLog,
  logConsumption,
  removeConsumedEntry,
  updateConsumedEntry,
} from "@/server/services/nutrition/daily-log-service"
import { setNutritionGoal } from "@/server/services/nutrition/goal-service"
import { selfTarget } from "@/server/services/nutrition/member-target"
import { getNutritionDay } from "@/server/services/nutrition/nutrition-day-service"
import type { DailyNutritionLogView, NutritionDayView } from "@/types/nutrition"

/*
 * Member nutrition. The member is ALWAYS the authenticated user
 * (`selfTarget(requireMember())`); no userId or gymId is ever read from the
 * request. `date` is the member's local calendar day ("YYYY-MM-DD") computed
 * in the browser — the server validates it but never substitutes its own.
 */

function refresh() {
  revalidatePath("/nutrition")
  revalidatePath("/dashboard")
}

/** Goal + plan for the day + actual log + progress (dashboard widget). */
export async function getNutritionDayAction(date: string): Promise<ActionResult<NutritionDayView>> {
  const member = await requireMember()
  try {
    return { ok: true, data: await getNutritionDay(selfTarget(member), date) }
  } catch (error) {
    return toActionError(error)
  }
}

export async function getOrCreateDailyLogAction(date: string): Promise<ActionResult<DailyNutritionLogView>> {
  const member = await requireMember()
  try {
    return { ok: true, data: await getOrCreateDailyNutritionLog(selfTarget(member), date) }
  } catch (error) {
    return toActionError(error)
  }
}

export async function setMyGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember()
  const values = formDataToObject(formData)
  try {
    await setNutritionGoal(selfTarget(member), member, values as unknown as NutritionGoalInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh()
  return { success: "Goal saved.", values }
}

export async function logConsumptionAction(date: string, input: LogConsumptionInput): Promise<ActionResult> {
  const member = await requireMember()
  try {
    await logConsumption(selfTarget(member), date, {
      dietPlanMealId: input?.dietPlanMealId,
      items: Array.isArray(input?.items) ? input.items : [],
    })
  } catch (error) {
    return toActionError(error)
  }
  refresh()
  return { ok: true }
}

export async function updateConsumedEntryAction(
  date: string,
  entryId: string,
  quantity: string | number
): Promise<ActionResult> {
  const member = await requireMember()
  try {
    await updateConsumedEntry(selfTarget(member), date, entryId, { quantity })
  } catch (error) {
    return toActionError(error)
  }
  refresh()
  return { ok: true }
}

export async function removeConsumedEntryAction(date: string, entryId: string): Promise<ActionResult> {
  const member = await requireMember()
  try {
    await removeConsumedEntry(selfTarget(member), date, entryId)
  } catch (error) {
    return toActionError(error)
  }
  refresh()
  return { ok: true }
}

/** Switch to one of MY personal plans from `startDate` (explicit replace rule applies). */
export async function useMyDietPlanAction(
  dietPlanId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const member = await requireMember()
  const values = formDataToObject(formData)
  try {
    // Plan must be the member's own (checked in the service); member id is the session's.
    await assignMyDietPlan(member, { ...values, dietPlanId } as unknown as AssignMyDietPlanInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh()
  revalidatePath("/nutrition/plans", "layout")
  return { success: "This plan is now your active diet." }
}

/**
 * Copy my current gym-assigned plan into a personal plan I can edit, from my
 * local `startDate`. The gym plan itself is never modified.
 */
export async function customizeMyDietPlanAction(startDate: string): Promise<ActionResult<{ planId: string }>> {
  const member = await requireMember()
  let planId: string
  try {
    ;({ planId } = await customizeMyDietPlan(member, { startDate }))
  } catch (error) {
    return toActionError(error)
  }
  refresh()
  revalidatePath("/nutrition/plans", "layout")
  return { ok: true, data: { planId } }
}
