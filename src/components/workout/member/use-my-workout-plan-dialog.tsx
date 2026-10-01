"use client"

import { useActionState, useEffect, useState } from "react"
import { CircleAlert, PlayCircle } from "lucide-react"

import { FormAlert } from "@/components/forms/form-alert"
import { LocalDateField } from "@/components/forms/local-date-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { initialFormState } from "@/lib/form-state"
import { useMyWorkoutPlanAction } from "@/server/actions/workout-actions"

function UsePlanForm({ planId, onDone }: { planId: string; onDone: () => void }) {
  const [state, formAction] = useActionState(useMyWorkoutPlanAction.bind(null, planId), initialFormState)
  const needsConfirm = state.code === "ACTIVE_WORKOUT_ASSIGNMENT_EXISTS"
  useEffect(() => {
    if (state.success) onDone()
  }, [state, onDone])

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {needsConfirm ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription className="space-y-2">
            <p>You already have an active workout plan. Switching ends it on the start date below.</p>
            <Button type="submit" name="replaceActive" value="true" variant="destructive" size="sm">
              End current plan and switch
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <FormAlert state={state} />
      )}
      <LocalDateField name="startDate" label="Start date" required state={state} description="Your local date. Earlier days keep the plan you had then." />
      <SubmitButton pendingLabel="Switching…">Use this plan</SubmitButton>
    </form>
  )
}

/** Make one of my personal plans my active workout plan. */
export function UseMyWorkoutPlanDialog({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlayCircle data-icon="inline-start" />
        Use this plan
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Use this plan</DialogTitle>
          <DialogDescription>It becomes the plan shown on your Workouts page from the start date.</DialogDescription>
        </DialogHeader>
        {open && <UsePlanForm planId={planId} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}
