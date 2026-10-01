"use client"

import { useActionState } from "react"

import { FormAlert } from "@/components/forms/form-alert"
import { FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { initialFormState } from "@/lib/form-state"
import { updateGymSettingsAction } from "@/server/actions/gym-actions"

export function GymSettingsForm({ gymName }: { gymName: string }) {
  const [state, formAction] = useActionState(updateGymSettingsAction, initialFormState)

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={state} />
      <FormField name="name" label="Gym name" required defaultValue={gymName} state={state} />
      <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
    </form>
  )
}
