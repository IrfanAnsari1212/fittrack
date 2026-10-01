"use client"

import { useActionState, useEffect, useState } from "react"
import { Pencil, Plus } from "lucide-react"

import { FormAlert } from "@/components/forms/form-alert"
import { FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { initialFormState } from "@/lib/form-state"
import { addMealAction, updateMealAction } from "@/server/actions/diet-plan-actions"

interface MealDetails {
  id: string
  name: string
  time: string
}

function MealForm({ planId, meal, onSaved }: { planId: string; meal?: MealDetails; onSaved: () => void }) {
  const [state, formAction] = useActionState(
    meal ? updateMealAction.bind(null, planId, meal.id) : addMealAction.bind(null, planId),
    initialFormState
  )
  useEffect(() => {
    if (state.success) onSaved()
  }, [state, onSaved])

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={{ error: state.error }} />
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <FormField name="name" label="Meal name" required defaultValue={meal?.name} placeholder="e.g. Breakfast, Pre-workout" state={state} />
        <FormField name="time" label="Time" type="time" required defaultValue={meal?.time ?? "08:00"} state={state} />
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">{meal ? "Save meal" : "Add meal"}</SubmitButton>
      </div>
    </form>
  )
}

export function MealFormDialog({ planId, meal }: { planId: string; meal?: MealDetails }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={meal ? <Button variant="ghost" size="icon-sm" aria-label={`Edit ${meal.name}`} title="Edit meal" /> : <Button variant="outline" />}
      >
        {meal ? <Pencil /> : <><Plus data-icon="inline-start" />Add meal</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{meal ? "Edit meal" : "Add meal"}</DialogTitle>
          <DialogDescription>Any name and time — meals are shown in the order you set.</DialogDescription>
        </DialogHeader>
        {open && <MealForm planId={planId} meal={meal} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}
