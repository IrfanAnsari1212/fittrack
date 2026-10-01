"use server"

import { revalidatePath } from "next/cache"

import type { ActionResult, FormState } from "@/lib/form-state"
import { formDataToObject } from "@/lib/validations/common"
import type { AssignWorkoutPlanInput } from "@/lib/validations/workout"
import { toActionError, toFormError } from "@/server/actions/action-utils"
import { requireGymAdmin } from "@/server/auth/session"
import { assignWorkoutPlan, endWorkoutPlanAssignment } from "@/server/services/workout/workout-assignment-service"

/*
 * Gym Admin → a member's workout plan assignment. The member id is bound in
 * the page but NOT trusted: the services verify the member belongs to the
 * admin's gym. assignedBy comes from the session. All calendar dates are
 * supplied by the browser (local day).
 */

const memberPath = (memberId: string) => `/admin/members/${memberId}`

export async function assignWorkoutPlanAction(memberId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireGymAdmin()
  const values = formDataToObject(formData)
  try {
    // memberId from the bound arg; any memberId field in the form is ignored.
    await assignWorkoutPlan(admin, { ...values, memberId } as unknown as AssignWorkoutPlanInput)
  } catch (error) {
    return toFormError(error, values)
  }
  revalidatePath(memberPath(memberId))
  return { success: "Workout plan assigned." }
}

export async function endWorkoutAssignmentAction(
  memberId: string,
  assignmentId: string,
  input: { status: "COMPLETED" | "CANCELLED"; endDate: string }
): Promise<ActionResult> {
  const admin = await requireGymAdmin()
  try {
    await endWorkoutPlanAssignment(admin, assignmentId, { status: input?.status, endDate: input?.endDate })
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath(memberPath(memberId))
  return { ok: true }
}
