"use client"

import { useActionState } from "react"

import { FormAlert } from "@/components/forms/form-alert"
import { FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { initialFormState } from "@/lib/form-state"
import { updateProfileAction } from "@/server/actions/profile-actions"

export function ProfileForm({
  profile,
}: {
  profile: { name: string; phone: string | null }
}) {
  const [state, formAction] = useActionState(updateProfileAction, initialFormState)

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={state} />
      <FormField name="name" label="Name" required defaultValue={profile.name} state={state} autoComplete="name" />
      <FormField name="phone" label="Phone" type="tel" defaultValue={profile.phone} state={state} autoComplete="tel" />
      <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
    </form>
  )
}
