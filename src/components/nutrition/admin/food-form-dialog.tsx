"use client"

import { useActionState, useEffect, useState } from "react"
import { Pencil, Plus } from "lucide-react"

import { FormAlert } from "@/components/forms/form-alert"
import { FormField } from "@/components/forms/form-field"
import { SelectField } from "@/components/forms/select-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { initialFormState } from "@/lib/form-state"
import { unitOptions } from "@/lib/nutrition/format"
import { saveFoodAction } from "@/server/actions/food-actions"
import type { FoodView } from "@/types/nutrition"

function FoodForm({ food, onSaved }: { food?: FoodView; onSaved: () => void }) {
  const [state, formAction] = useActionState(saveFoodAction.bind(null, food?.id ?? null), initialFormState)

  useEffect(() => {
    if (state.success) onSaved()
  }, [state, onSaved])

  const num = (v: number | null | undefined) => (v == null ? "" : String(v))

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={{ error: state.error }} />
      <FormField name="name" label="Name" required defaultValue={food?.name} state={state} placeholder="e.g. Egg" />
      <div className="grid grid-cols-2 gap-3">
        <FormField name="servingSize" label="Serving size" type="number" step="any" min="0" required defaultValue={num(food?.servingSize ?? 1)} state={state} />
        <SelectField name="servingUnit" label="Serving unit" required options={unitOptions} defaultValue={food?.servingUnit ?? "g"} state={state} />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Nutrition values below are per one serving.</p>
      <div className="grid grid-cols-2 gap-3">
        <FormField name="calories" label="Calories (kcal)" type="number" step="any" min="0" required defaultValue={num(food?.calories)} state={state} />
        <FormField name="protein" label="Protein (g)" type="number" step="any" min="0" required defaultValue={num(food?.protein)} state={state} />
        <FormField name="carbs" label="Carbs (g)" type="number" step="any" min="0" defaultValue={num(food?.carbs)} state={state} />
        <FormField name="fat" label="Fat (g)" type="number" step="any" min="0" defaultValue={num(food?.fat)} state={state} />
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">{food ? "Save changes" : "Add food"}</SubmitButton>
      </div>
    </form>
  )
}

export function FoodFormDialog({ food }: { food?: FoodView }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          food ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${food.name}`} />
          ) : (
            <Button />
          )
        }
      >
        {food ? <Pencil /> : <><Plus data-icon="inline-start" />Add food</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{food ? `Edit ${food.name}` : "Add food"}</DialogTitle>
          <DialogDescription>
            {food
              ? "Changes apply to every diet plan using this food. Logged history keeps its original values."
              : "Add a food to your gym's library."}
          </DialogDescription>
        </DialogHeader>
        {open && <FoodForm food={food} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}
