"use client"

import { useActionState, useEffect, useState } from "react"
import { Pencil, Plus } from "lucide-react"

import { FormAlert } from "@/components/forms/form-alert"
import { FormField } from "@/components/forms/form-field"
import { SelectField } from "@/components/forms/select-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { initialFormState } from "@/lib/form-state"
import { EXERCISE_CATEGORIES, EXERCISE_CATEGORY_LABELS, MUSCLE_GROUPS } from "@/lib/workout/constants"
import { saveExerciseAction } from "@/server/actions/exercise-actions"
import type { ExerciseView } from "@/types/workout"

function ExerciseForm({ exercise, onSaved }: { exercise?: ExerciseView; onSaved: () => void }) {
  const [state, formAction] = useActionState(saveExerciseAction.bind(null, exercise?.id ?? null), initialFormState)
  useEffect(() => {
    if (state.success) onSaved()
  }, [state, onSaved])

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={{ error: state.error }} />
      <FormField name="name" label="Name" required defaultValue={exercise?.name} placeholder="e.g. Barbell Bench Press" state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          name="muscleGroup"
          label="Muscle group"
          required
          options={MUSCLE_GROUPS.map((g) => ({ value: g, label: g }))}
          defaultValue={exercise?.muscleGroup ?? "Chest"}
          state={state}
        />
        <SelectField
          name="category"
          label="Type"
          required
          options={EXERCISE_CATEGORIES.map((c) => ({ value: c, label: EXERCISE_CATEGORY_LABELS[c] }))}
          defaultValue={exercise?.category ?? "STRENGTH"}
          state={state}
        />
      </div>
      <FormField name="equipment" label="Equipment" defaultValue={exercise?.equipment} placeholder="e.g. Barbell, Dumbbells" state={state} />
      <FormField name="description" label="Instructions" multiline defaultValue={exercise?.description} state={state} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">{exercise ? "Save exercise" : "Add exercise"}</SubmitButton>
      </div>
    </form>
  )
}

export function ExerciseFormDialog({ exercise }: { exercise?: ExerciseView }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={exercise ? <Button variant="ghost" size="icon-sm" aria-label={`Edit ${exercise.name}`} title="Edit" /> : <Button />}
      >
        {exercise ? <Pencil /> : <><Plus data-icon="inline-start" />New exercise</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{exercise ? "Edit exercise" : "New exercise"}</DialogTitle>
          <DialogDescription>Members and plans in your gym can use it.</DialogDescription>
        </DialogHeader>
        {open && <ExerciseForm exercise={exercise} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}
