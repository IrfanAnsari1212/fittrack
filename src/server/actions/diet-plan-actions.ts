"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import type { ActionResult, FormState } from "@/lib/form-state"
import { formDataToObject } from "@/lib/validations/common"
import type { DietPlanInput, DietPlanMealInput, MealFoodInput, MealFoodQuantityInput } from "@/lib/validations/nutrition"
import { toActionError, toFormError } from "@/server/actions/action-utils"
import { requireGymUser } from "@/server/auth/session"
import {
  addDietPlanMeal,
  addDietPlanMealFood,
  createDietPlan,
  deleteDietPlanMeal,
  removeDietPlanMealFood,
  reorderDietPlanMeals,
  setDietPlanArchived,
  updateDietPlan,
  updateDietPlanMeal,
  updateDietPlanMealFood,
  type PlanEditor,
} from "@/server/services/nutrition/diet-plan-service"

/*
 * Diet-plan builder, shared by Gym Admins (gym plans) and Members (their own
 * personal plans). WHICH plans the caller may touch is decided by the
 * diet-plan service from the authenticated role (admins → gym plans only,
 * members → only plans they own); these actions only authenticate, delegate
 * and refresh. createdBy / ownership come from the session, never the input.
 */

const ADMIN_PLANS = "/admin/diet-plans"
const MEMBER_PLANS = "/nutrition/plans"

function planPath(editor: { role: string }, planId: string) {
  return `${editor.role === "GYM_ADMIN" ? ADMIN_PLANS : MEMBER_PLANS}/${planId}`
}

function refresh(planId?: string) {
  for (const base of [ADMIN_PLANS, MEMBER_PLANS]) {
    revalidatePath(base)
    if (planId) revalidatePath(`${base}/${planId}`)
  }
  revalidatePath("/nutrition")
}

export async function createDietPlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const editor = await requireGymUser()
  const values = formDataToObject(formData)
  let id: string
  try {
    ;({ id } = await createDietPlan(editor as PlanEditor, values as unknown as DietPlanInput))
  } catch (error) {
    return toFormError(error, values)
  }
  refresh()
  redirect(planPath(editor, id))
}

export async function updateDietPlanAction(planId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const editor = await requireGymUser()
  const values = formDataToObject(formData)
  try {
    await updateDietPlan(editor as PlanEditor, planId, values as unknown as DietPlanInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh(planId)
  return { success: "Plan details saved.", values }
}

export async function setDietPlanArchivedAction(planId: string, archived: boolean): Promise<ActionResult> {
  const editor = await requireGymUser()
  try {
    await setDietPlanArchived(editor as PlanEditor, planId, archived === true)
  } catch (error) {
    return toActionError(error)
  }
  refresh(planId)
  return { ok: true }
}

// ── Meals ────────────────────────────────────────────────────────────────

export async function addMealAction(planId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const editor = await requireGymUser()
  const values = formDataToObject(formData)
  try {
    await addDietPlanMeal(editor as PlanEditor, planId, values as unknown as DietPlanMealInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh(planId)
  return { success: "Meal added." }
}

export async function updateMealAction(
  planId: string,
  mealId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const editor = await requireGymUser()
  const values = formDataToObject(formData)
  try {
    await updateDietPlanMeal(editor as PlanEditor, mealId, values as unknown as DietPlanMealInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh(planId)
  return { success: "Meal saved." }
}

export async function deleteMealAction(planId: string, mealId: string): Promise<ActionResult> {
  const editor = await requireGymUser()
  try {
    await deleteDietPlanMeal(editor as PlanEditor, mealId)
  } catch (error) {
    return toActionError(error)
  }
  refresh(planId)
  return { ok: true }
}

export async function reorderMealsAction(planId: string, mealIds: string[]): Promise<ActionResult> {
  const editor = await requireGymUser()
  try {
    await reorderDietPlanMeals(editor as PlanEditor, planId, mealIds)
  } catch (error) {
    return toActionError(error)
  }
  refresh(planId)
  return { ok: true }
}

// ── Planned foods ────────────────────────────────────────────────────────

export async function addMealFoodAction(
  planId: string,
  mealId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const editor = await requireGymUser()
  const values = formDataToObject(formData)
  try {
    await addDietPlanMealFood(editor as PlanEditor, mealId, values as unknown as MealFoodInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh(planId)
  return { success: "Food added to meal." }
}

export async function updateMealFoodAction(
  planId: string,
  mealFoodId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const editor = await requireGymUser()
  const values = formDataToObject(formData)
  try {
    await updateDietPlanMealFood(editor as PlanEditor, mealFoodId, values as unknown as MealFoodQuantityInput)
  } catch (error) {
    return toFormError(error, values)
  }
  refresh(planId)
  return { success: "Quantity updated." }
}

export async function removeMealFoodAction(planId: string, mealFoodId: string): Promise<ActionResult> {
  const editor = await requireGymUser()
  try {
    await removeDietPlanMealFood(editor as PlanEditor, mealFoodId)
  } catch (error) {
    return toActionError(error)
  }
  refresh(planId)
  return { ok: true }
}
