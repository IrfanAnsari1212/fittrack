"use server"

import { revalidatePath } from "next/cache"

import type { ActionResult, FormState } from "@/lib/form-state"
import { formDataToObject } from "@/lib/validations/common"
import type { FoodInput } from "@/lib/validations/nutrition"
import { toActionError, toFormError } from "@/server/actions/action-utils"
import { requireGymAdmin } from "@/server/auth/session"
import { createFood, deleteFood, setFoodArchived, updateFood } from "@/server/services/nutrition/food-service"

/*
 * Gym Admin food library. The gym always comes from `requireGymAdmin()`;
 * input is validated by the food service (unknown keys such as gymId are
 * stripped there). Bound ids (foodId) are re-checked inside the admin's gym.
 */

const FOODS_PATH = "/admin/foods"

/** Create (foodId null) or update a food. */
export async function saveFoodAction(
  foodId: string | null,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const admin = await requireGymAdmin()
  const values = formDataToObject(formData)
  try {
    if (foodId) await updateFood(admin, foodId, values as unknown as FoodInput)
    else await createFood(admin, values as unknown as FoodInput)
  } catch (error) {
    return toFormError(error, values)
  }
  revalidatePath(FOODS_PATH)
  revalidatePath("/admin/diet-plans", "layout")
  return { success: foodId ? "Food updated." : "Food added." }
}

export async function setFoodArchivedAction(foodId: string, archived: boolean): Promise<ActionResult> {
  const admin = await requireGymAdmin()
  try {
    await setFoodArchived(admin, foodId, archived === true)
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath(FOODS_PATH)
  return { ok: true }
}

export async function deleteFoodAction(foodId: string): Promise<ActionResult> {
  const admin = await requireGymAdmin()
  try {
    await deleteFood(admin, foodId)
  } catch (error) {
    return toActionError(error)
  }
  revalidatePath(FOODS_PATH)
  return { ok: true }
}
