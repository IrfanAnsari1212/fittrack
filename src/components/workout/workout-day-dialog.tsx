"use client"

import { useActionState, useEffect, useState } from "react"
import { Pencil, Plus } from "lucide-react"

import { FormAlert } from "@/components/forms/form-alert"
import { FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { initialFormState } from "@/lib/form-state"
import { addWorkoutDayAction, updateWorkoutDayAction } from "@/server/actions/workout-plan-actions"

interface DayDetails {
  id: string
  name: string
  description: string | null
}

function DayForm({ planId, day, onSaved }: { planId: string; day?: DayDetails; onSaved: () => void }) {
  const [state, formAction] = useActionState(
    day ? updateWorkoutDayAction.bind(null, planId, day.id) : addWorkoutDayAction.bind(null, planId),
    initialFormState
  )
  useEffect(() => {
    if (state.success) onSaved()
  }, [state, onSaved])

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={{ error: state.error }} />
      <FormField name="name" label="Name" required defaultValue={day?.name} placeholder="e.g. Push, Leg day, Monday" state={state} />
      <FormField name="description" label="Notes" multiline defaultValue={day?.description} state={state} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">{day ? "Save workout" : "Add workout"}</SubmitButton>
      </div>
    </form>
  )
}

export function WorkoutDayDialog({ planId, day }: { planId: string; day?: DayDetails }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={day ? <Button variant="ghost" size="icon-sm" aria-label={`Edit ${day.name}`} title="Edit workout day" /> : <Button variant="outline" />}
      >
        {day ? <Pencil /> : <><Plus data-icon="inline-start" />Add workout day</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{day ? "Edit workout day" : "Add workout day"}</DialogTitle>
          <DialogDescription>Any name — there is no fixed weekly schedule. Days are done in the order shown.</DialogDescription>
        </DialogHeader>
        {open && <DayForm planId={planId} day={day} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}
