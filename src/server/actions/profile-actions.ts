"use server"

import { revalidatePath } from "next/cache"

import type { FormState } from "@/lib/form-state"
import { profileSchema } from "@/lib/validations/schemas"
import { domainErrorState, parseForm } from "@/server/actions/action-utils"
import { requireAuth } from "@/server/auth/session"
import { updateOwnProfile } from "@/server/services/profile-service"

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAuth()
  const parsed = parseForm(profileSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await updateOwnProfile(user, parsed.data)
  } catch (error) {
    return domainErrorState(error, parsed.values)
  }
  revalidatePath("/", "layout")
  return { success: "Profile updated.", values: parsed.values }
}
