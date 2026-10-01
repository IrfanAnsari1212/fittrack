"use client"

import { useActionState, useEffect, useState } from "react"
import { Pencil, Plus } from "lucide-react"

import { FormAlert } from "@/components/forms/form-alert"
import { FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { initialFormState } from "@/lib/form-state"
import { createWorkoutPlanAction, updateWorkoutPlanAction } from "@/server/actions/workout-plan-actions"

interface PlanDetails {
  id: string
  name: string
  description: string | null
}

function PlanForm({ plan, onSaved }: { plan?: PlanDetails; onSaved: () => void }) {
  const [state, formAction] = useActionState(
    plan ? updateWorkoutPlanAction.bind(null, plan.id) : createWorkoutPlanAction,
    initialFormState
  )
  useEffect(() => {
    if (state.success) onSaved()
  }, [state, onSaved])

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={{ error: state.error }} />
      <FormField name="name" label="Plan name" required defaultValue={plan?.name} placeholder="e.g. Push Pull Legs" state={state} />
      <FormField name="description" label="Description" multiline defaultValue={plan?.description} state={state} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">{plan ? "Save" : "Create plan"}</SubmitButton>
      </div>
    </form>
  )
}

/** Create a plan (redirects to the builder) or edit its name/description. */
export function WorkoutPlanFormDialog({ plan }: { plan?: PlanDetails }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={plan ? "outline" : "default"} />}>
        {plan ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
        {plan ? "Edit details" : "New workout plan"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plan ? "Edit plan details" : "New workout plan"}</DialogTitle>
          <DialogDescription>
            {plan ? "Rename the plan or update its description." : "You'll add workout days and exercises next."}
          </DialogDescription>
        </DialogHeader>
        {open && <PlanForm plan={plan} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}
