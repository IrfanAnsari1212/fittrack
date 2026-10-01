"use client"

import { useActionState } from "react"
import { CircleAlert } from "lucide-react"

import { FormAlert } from "@/components/forms/form-alert"
import { LocalDateField } from "@/components/forms/local-date-field"
import { SelectField } from "@/components/forms/select-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { initialFormState } from "@/lib/form-state"
import { assignWorkoutPlanAction } from "@/server/actions/member-workout-admin-actions"

/**
 * Assign a workout plan to a member. If the member already has an active plan
 * the server refuses (ACTIVE_WORKOUT_ASSIGNMENT_EXISTS); the admin can then
 * confirm with a second, explicit submit that sends replaceActive=true.
 */
export function AssignWorkoutPlanForm({ memberId, plans }: { memberId: string; plans: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(assignWorkoutPlanAction.bind(null, memberId), initialFormState)
  const needsConfirm = state.code === "ACTIVE_WORKOUT_ASSIGNMENT_EXISTS"

  if (plans.length === 0) {
    return <p className="text-sm text-muted-foreground">No active workout plans yet. Create one under Workout Plans.</p>
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {needsConfirm ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription className="space-y-2">
            <p>{state.error}</p>
            <Button type="submit" name="replaceActive" value="true" variant="destructive" size="sm">
              End current plan and assign this one
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <FormAlert state={state} />
      )}
      <SelectField name="workoutPlanId" label="Workout plan" required options={plans.map((p) => ({ value: p.id, label: p.name }))} defaultValue={plans[0].id} state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <LocalDateField name="startDate" label="Start date" required state={state} />
        <LocalDateField name="endDate" label="End date" defaultToToday={false} state={state} />
      </div>
      <SubmitButton pendingLabel="Assigning…">Assign plan</SubmitButton>
    </form>
  )
}
