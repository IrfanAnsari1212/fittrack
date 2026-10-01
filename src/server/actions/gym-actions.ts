"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import type { FormState } from "@/lib/form-state"
import { createGymSchema, gymSettingsSchema } from "@/lib/validations/schemas"
import { domainErrorState, parseForm } from "@/server/actions/action-utils"
import { requireGymAdmin, requireSuperAdmin } from "@/server/auth/session"
import { createGymWithAdmin, updateOwnGym } from "@/server/services/gym-service"

/** Super Admin: create a gym together with its primary Gym Admin. */
export async function createGymAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireSuperAdmin()
  const parsed = parseForm(createGymSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await createGymWithAdmin(actor, parsed.data)
  } catch (error) {
    return domainErrorState(error, parsed.values)
  }
  revalidatePath("/super-admin", "layout")
  redirect("/super-admin/gyms")
}

/** Gym Admin: update settings of their own gym (gym id from session). */
export async function updateGymSettingsAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const admin = await requireGymAdmin()
  const parsed = parseForm(gymSettingsSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await updateOwnGym(admin, parsed.data)
  } catch (error) {
    return domainErrorState(error, parsed.values)
  }
  revalidatePath("/", "layout")
  return { success: "Gym settings saved.", values: parsed.values }
}
