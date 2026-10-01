"use server"

import { revalidatePath } from "next/cache"

import type { ActionResult } from "@/lib/form-state"
import type { WeightUnit } from "@/lib/workout/constants"
import { toActionError } from "@/server/actions/action-utils"
import { requireMember } from "@/server/auth/session"
import { selfTarget } from "@/server/services/nutrition/member-target"
import { getPerformanceHighlight } from "@/server/services/workout/performance-service"
import { setPlannedExerciseTargetWeight } from "@/server/services/workout/workout-plan-service"
import type { PerformanceHighlight } from "@/types/performance"

/*
 * Member performance. The member is ALWAYS the authenticated user
 * (`selfTarget(requireMember())`); no member/user/gym id comes from the
 * request. Nothing here derives a calendar day.
 */

/** One concise line about the latest completed workout (dashboard). */
export async function getPerformanceHighlightAction(): Promise<ActionResult<PerformanceHighlight | null>> {
  const member = await requireMember()
  try {
    return { ok: true, data: await getPerformanceHighlight(selfTarget(member)) }
  } catch (error) {
    return toActionError(error)
  }
}

/**
 * EXPLICIT "Use this target weight": the member chose to adopt a suggestion.
 * The plan service only lets a member change a planned exercise of their OWN
 * personal plan — a shared gym plan is "not found" (customize it first).
 */
export async function applySuggestedTargetAction(
  plannedExerciseId: string,
  targetWeight: number,
  weightUnit: WeightUnit
): Promise<ActionResult> {
  const member = await requireMember()
  try {
    await setPlannedExerciseTargetWeight(member, plannedExerciseId, { targetWeight, weightUnit })
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath("/workouts/progress")
  revalidatePath("/workouts", "layout")
  return { ok: true }
}
