"use client"

import { useActionState } from "react"

import { FormAlert } from "@/components/forms/form-alert"
import { FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { initialFormState } from "@/lib/form-state"
import { loginAction } from "@/server/actions/auth-actions"

export function LoginForm({
  callbackUrl,
  initialError,
}: {
  callbackUrl?: string
  initialError?: string
}) {
  const [state, formAction] = useActionState(
    loginAction,
    initialError ? { error: initialError } : initialFormState
  )

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={state} />
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        state={state}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        state={state}
      />
      <SubmitButton className="w-full" pendingLabel="Logging in…">
        Log in
      </SubmitButton>
    </form>
  )
}
