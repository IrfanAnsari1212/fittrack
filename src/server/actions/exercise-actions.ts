"use server"

import { revalidatePath } from "next/cache"

import type { ActionResult, FormState } from "@/lib/form-state"
import { formDataToObject } from "@/lib/validations/common"
import type { ExerciseInput } from "@/lib/validations/workout"
import { toActionError, toFormError } from "@/server/actions/action-utils"
import { requireGymAdmin } from "@/server/auth/session"
import { createExercise, setExerciseArchived, updateExercise } from "@/server/services/workout/exercise-service"

/*
 * Gym Admin exercise library. The gym always comes from `requireGymAdmin()`;
 * the service validates input (a forged gymId is stripped) and re-checks any
 * bound exercise id inside the admin's gym.
 */

const EXERCISES_PATH = "/admin/exercises"

function refresh() {
  revalidatePath(EXERCISES_PATH)
  revalidatePath("/admin/workouts", "layout")
}

/** Create (exerciseId null) or update an exercise. */
export async function saveExerciseAction(
  exerciseId: string | null,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const admin = await requireGymAdmin()
  const values = formDataToObject(formData)
  try {
    if (exerciseId) await updateExercise(admin, exerciseId, values as unknown as ExerciseInput)
    else await createExercise(admin, values as unknown as ExerciseInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh()
  return { success: exerciseId ? "Exercise updated." : "Exercise added." }
}

export async function setExerciseArchivedAction(exerciseId: string, archived: boolean): Promise<ActionResult> {
  const admin = await requireGymAdmin()
  try {
    await setExerciseArchived(admin, exerciseId, archived === true)
  } catch (error) {
    return toActionError(error)
  }
  refresh()
  return { ok: true }
}
