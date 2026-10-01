"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { Pencil, Plus } from "lucide-react"

import { FormAlert } from "@/components/forms/form-alert"
import { FormField } from "@/components/forms/form-field"
import { SelectField } from "@/components/forms/select-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { initialFormState } from "@/lib/form-state"
import { WEIGHT_UNITS } from "@/lib/workout/constants"
import { addPlannedExerciseAction, updatePlannedExerciseAction } from "@/server/actions/workout-plan-actions"
import type { ExerciseView, PlannedExerciseView } from "@/types/workout"

export type ExerciseOption = Pick<ExerciseView, "id" | "name" | "muscleGroup">

/** sets / reps / weight / rest / notes — shared by add and edit. */
function PrescriptionFields({ state, item }: { state: typeof initialFormState; item?: PlannedExerciseView }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <FormField name="sets" label="Sets" type="number" min="1" step="1" required defaultValue={String(item?.sets ?? 3)} state={state} />
        <FormField name="repsMin" label="Reps" type="number" min="1" step="1" required defaultValue={String(item?.repsMin ?? 8)} state={state} />
        <FormField name="repsMax" label="To reps" type="number" min="1" step="1" defaultValue={item?.repsMax == null ? "" : String(item.repsMax)} state={state} />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">For a rep range such as 6–8, enter 6 and 8. Leave “To reps” empty for a fixed count.</p>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <FormField name="targetWeight" label="Target weight" type="number" min="0" step="any" defaultValue={item?.targetWeight == null ? "" : String(item.targetWeight)} state={state} />
        <SelectField name="weightUnit" label="Unit" options={WEIGHT_UNITS.map((u) => ({ value: u, label: u }))} defaultValue={item?.weightUnit ?? "kg"} state={state} />
      </div>
      <FormField name="restSeconds" label="Rest (seconds)" type="number" min="0" step="5" defaultValue={item?.restSeconds == null ? "" : String(item.restSeconds)} state={state} />
      <FormField name="notes" label="Notes" multiline defaultValue={item?.notes} state={state} />
    </>
  )
}

function AddForm({ planId, dayId, exercises, onSaved }: { planId: string; dayId: string; exercises: ExerciseOption[]; onSaved: () => void }) {
  const [state, formAction] = useActionState(addPlannedExerciseAction.bind(null, planId, dayId), initialFormState)
  const [exerciseId, setExerciseId] = useState(state.values?.exerciseId ?? exercises[0]?.id ?? "")
  const exercise = useMemo(() => exercises.find((e) => e.id === exerciseId), [exercises, exerciseId])
  useEffect(() => {
    if (state.success) onSaved()
  }, [state, onSaved])

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={{ error: state.error }} />
      <div className="space-y-2">
        <Label htmlFor="exerciseId">Exercise</Label>
        <NativeSelect id="exerciseId" name="exerciseId" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} className="w-full">
          {exercises.map((e) => (
            <NativeSelectOption key={e.id} value={e.id}>
              {e.name} · {e.muscleGroup}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {exercise && <p className="text-xs text-muted-foreground">{exercise.muscleGroup}</p>}
        {state.fieldErrors?.exerciseId?.[0] && <p className="text-sm text-destructive">{state.fieldErrors.exerciseId[0]}</p>}
      </div>
      <PrescriptionFields state={state} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Adding…">Add exercise</SubmitButton>
      </div>
    </form>
  )
}

function EditForm({ planId, item, onSaved }: { planId: string; item: PlannedExerciseView; onSaved: () => void }) {
  const [state, formAction] = useActionState(updatePlannedExerciseAction.bind(null, planId, item.id), initialFormState)
  useEffect(() => {
    if (state.success) onSaved()
  }, [state, onSaved])
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={{ error: state.error }} />
      <PrescriptionFields state={state} item={item} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save exercise</SubmitButton>
      </div>
    </form>
  )
}

export function AddPlannedExerciseDialog({
  planId,
  dayId,
  dayName,
  exercises,
}: {
  planId: string
  dayId: string
  dayName: string
  exercises: ExerciseOption[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" disabled={exercises.length === 0} />}>
        <Plus data-icon="inline-start" />
        Add exercise
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add exercise to {dayName}</DialogTitle>
          <DialogDescription>Choose from your gym&apos;s exercise library and set the target.</DialogDescription>
        </DialogHeader>
        {open && <AddForm planId={planId} dayId={dayId} exercises={exercises} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

export function EditPlannedExerciseDialog({ planId, item }: { planId: string; item: PlannedExerciseView }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Edit ${item.exerciseName}`} title="Edit exercise" />}>
        <Pencil />
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item.exerciseName}</DialogTitle>
          <DialogDescription>Change the planned sets, reps, weight and rest.</DialogDescription>
        </DialogHeader>
        {open && <EditForm planId={planId} item={item} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}
