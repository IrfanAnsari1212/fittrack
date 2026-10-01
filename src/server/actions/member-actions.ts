"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { USER_STATUSES } from "@/lib/auth/roles"
import type { FormState } from "@/lib/form-state"
import { createMemberSchema, updateMemberSchema } from "@/lib/validations/schemas"
import { domainErrorState, parseForm } from "@/server/actions/action-utils"
import { requireGymAdmin } from "@/server/auth/session"
import { DomainError } from "@/server/errors"
import { createMember, setMemberStatus, updateMember } from "@/server/services/member-service"

/*
 * The gym is never read from the request: `requireGymAdmin()` derives it
 * from the session, and the schemas strip any submitted gymId.
 */

export async function createMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireGymAdmin()
  const parsed = parseForm(createMemberSchema, formData)
  if (!parsed.ok) return parsed.state

  let memberId: string
  try {
    ;({ id: memberId } = await createMember(admin, parsed.data))
  } catch (error) {
    return domainErrorState(error, parsed.values)
  }
  revalidatePath("/admin/members")
  redirect(`/admin/members/${memberId}`)
}

export async function updateMemberAction(
  memberId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const admin = await requireGymAdmin()
  const parsed = parseForm(updateMemberSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await updateMember(admin, memberId, parsed.data)
  } catch (error) {
    return domainErrorState(error, parsed.values)
  }
  revalidatePath("/admin/members")
  redirect(`/admin/members/${memberId}`)
}

const statusSchema = z.enum(USER_STATUSES)

export async function setMemberStatusAction(
  memberId: string,
  status: string
): Promise<{ error?: string }> {
  const admin = await requireGymAdmin()
  const parsed = statusSchema.safeParse(status)
  if (!parsed.success) return { error: "Invalid status." }

  try {
    await setMemberStatus(admin, memberId, parsed.data)
  } catch (error) {
    if (error instanceof DomainError) return { error: "Member not found." }
    throw error
  }
  revalidatePath("/admin/members")
  revalidatePath(`/admin/members/${memberId}`)
  return {}
}
