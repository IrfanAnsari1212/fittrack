import { CircleAlert, CircleCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import type { FormState } from "@/lib/form-state"

/** Form-level error/success message from a server action. */
export function FormAlert({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <Alert variant="destructive" role="alert">
        <CircleAlert />
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    )
  }
  if (state.success) {
    return (
      <Alert role="status">
        <CircleCheck />
        <AlertDescription>{state.success}</AlertDescription>
      </Alert>
    )
  }
  return null
}
