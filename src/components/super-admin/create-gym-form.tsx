"use client"

import { useActionState } from "react"
import Link from "next/link"

import { FormAlert } from "@/components/forms/form-alert"
import { FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { initialFormState } from "@/lib/form-state"
import { createGymAction } from "@/server/actions/gym-actions"

export function CreateGymForm() {
  const [state, formAction] = useActionState(createGymAction, initialFormState)

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormAlert state={state} />
      <section className="space-y-4">
        <h2 className="text-sm font-medium">Gym</h2>
        <FormField name="gymName" label="Gym name" required state={state} />
      </section>
      <Separator />
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Gym admin</h2>
          <p className="text-sm text-muted-foreground">
            The owner/manager account. It becomes the gym&apos;s primary admin.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="adminName" label="Full name" required autoComplete="off" state={state} />
          <FormField name="adminEmail" label="Email" type="email" required autoComplete="off" state={state} />
        </div>
        <FormField
          name="adminPassword"
          label="Initial password"
          type="password"
          required
          autoComplete="new-password"
          description="At least 8 characters. Share it with the gym owner securely."
          state={state}
        />
      </section>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" nativeButton={false} render={<Link href="/super-admin/gyms" />}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Creating…">Create gym</SubmitButton>
      </div>
    </form>
  )
}
