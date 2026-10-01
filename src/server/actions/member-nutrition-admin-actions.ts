"use server"

import { revalidatePath } from "next/cache"

import type { ActionResult, FormState } from "@/lib/form-state"
import { formDataToObject } from "@/lib/validations/common"
import type { AssignDietPlanInput, NutritionGoalInput } from "@/lib/validations/nutrition"
import { toActionError, toFormError } from "@/server/actions/action-utils"
import { requireGymAdmin } from "@/server/auth/session"
import { assignDietPlan, endDietPlanAssignment } from "@/server/services/nutrition/assignment-service"
import { setNutritionGoal } from "@/server/services/nutrition/goal-service"
import { gymMemberTarget } from "@/server/services/nutrition/member-target"

/*
 * Gym Admin → a member's nutrition (plan assignment and goals).
 * The member id is bound in the page but NOT trusted: `gymMemberTarget` /
 * `assignDietPlan` verify the member belongs to the admin's gym. assignedBy
 * and setBy come from the session. All calendar dates (startDate, endDate,
 * effectiveFrom) are supplied by the browser in the user's local timezone.
 */

const memberPath = (memberId: string) => `/admin/members/${memberId}`

export async function assignDietPlanAction(
  memberId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const admin = await requireGymAdmin()
  const values = formDataToObject(formData)
  try {
    // memberId from the bound arg; any memberId field in the form is ignored.
    await assignDietPlan(admin, { ...values, memberId } as unknown as AssignDietPlanInput)
  } catch (error) {
    return toFormError(error, values)
  }
  revalidatePath(memberPath(memberId))
  return { success: "Diet plan assigned." }
}

export async function endAssignmentAction(
  memberId: string,
  assignmentId: string,
  input: { status: "COMPLETED" | "CANCELLED"; endDate: string }
): Promise<ActionResult> {
  const admin = await requireGymAdmin()
  try {
    await endDietPlanAssignment(admin, assignmentId, {
      status: input?.status,
      endDate: input?.endDate,
    })
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath(memberPath(memberId))
  return { ok: true }
}

export async function setMemberGoalAction(
  memberId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const admin = await requireGymAdmin()
  const values = formDataToObject(formData)
  try {
    const target = await gymMemberTarget(admin, memberId)
    await setNutritionGoal(target, admin, values as unknown as NutritionGoalInput)
  } catch (error) {
    return toFormError(error, values)
  }
  revalidatePath(memberPath(memberId))
  return { success: "Nutrition goal saved.", values }
}
