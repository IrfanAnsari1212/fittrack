"use client"

import { useActionState } from "react"
import Link from "next/link"

import { FormAlert } from "@/components/forms/form-alert"
import { FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Button } from "@/components/ui/button"
import { initialFormState, type FormState } from "@/lib/form-state"
import type { MemberDetail } from "@/types/admin"

interface MemberFormProps {
  /** Server action. Note: the form never sends a gymId; the server derives it. */
  action: (state: FormState, formData: FormData) => Promise<FormState>
  member?: MemberDetail
  cancelHref: string
}

export function MemberForm({ action, member, cancelHref }: MemberFormProps) {
  const [state, formAction] = useActionState(action, initialFormState)
  const isEdit = Boolean(member)

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="name" label="Full name" required autoComplete="off" defaultValue={member?.name} state={state} />
        <FormField name="email" label="Email" type="email" required autoComplete="off" defaultValue={member?.email} state={state} />
        <FormField name="phone" label="Phone" type="tel" defaultValue={member?.phone} state={state} />
        <FormField name="dateOfBirth" label="Date of birth" type="date" defaultValue={member?.dateOfBirth} state={state} />
      </div>
      {!isEdit && (
        <FormField
          name="password"
          label="Initial password"
          type="password"
          required
          autoComplete="new-password"
          description="At least 8 characters. Share it with the member securely."
          state={state}
        />
      )}
      <FormField name="notes" label="Notes" multiline defaultValue={member?.notes} state={state} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" nativeButton={false} render={<Link href={cancelHref} />}>
          Cancel
        </Button>
        <SubmitButton pendingLabel={isEdit ? "Saving…" : "Adding…"}>
          {isEdit ? "Save changes" : "Add member"}
        </SubmitButton>
      </div>
    </form>
  )
}
