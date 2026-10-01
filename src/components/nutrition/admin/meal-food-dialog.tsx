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
import { formatServing, unitOptionsFor } from "@/lib/nutrition/format"
import type { ServingUnit } from "@/lib/nutrition/units"
import { addMealFoodAction, updateMealFoodAction } from "@/server/actions/diet-plan-actions"
import type { FoodView, PlannedFoodView } from "@/types/nutrition"

export type FoodOption = Pick<FoodView, "id" | "name" | "servingSize" | "servingUnit">

function AddForm({ planId, mealId, foods, onSaved }: { planId: string; mealId: string; foods: FoodOption[]; onSaved: () => void }) {
  const [state, formAction] = useActionState(addMealFoodAction.bind(null, planId, mealId), initialFormState)
  const [foodId, setFoodId] = useState(state.values?.foodId ?? foods[0]?.id ?? "")
  const food = useMemo(() => foods.find((f) => f.id === foodId), [foods, foodId])
  useEffect(() => {
    if (state.success) onSaved()
  }, [state, onSaved])

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={{ error: state.error }} />
      <div className="space-y-2">
        <Label htmlFor="foodId">Food</Label>
        <NativeSelect id="foodId" name="foodId" value={foodId} onChange={(e) => setFoodId(e.target.value)} className="w-full">
          {foods.map((f) => (
            <NativeSelectOption key={f.id} value={f.id}>
              {f.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {food && <p className="text-xs text-muted-foreground">Nutrition is defined {formatServing(food.servingSize, food.servingUnit)}.</p>}
        {state.fieldErrors?.foodId?.[0] && <p className="text-sm text-destructive">{state.fieldErrors.foodId[0]}</p>}
      </div>
      <QuantityFields state={state} servingUnit={food?.servingUnit ?? "serving"} key={food?.id} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Adding…">Add to meal</SubmitButton>
      </div>
    </form>
  )
}

function QuantityFields({
  state,
  servingUnit,
  quantity,
  unit,
}: {
  state: typeof initialFormState
  servingUnit: ServingUnit
  quantity?: number
  unit?: ServingUnit
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField name="quantity" label="Quantity" type="number" step="any" min="0" required defaultValue={quantity == null ? "1" : String(quantity)} state={state} />
      <SelectField name="unit" label="Unit" required options={unitOptionsFor(servingUnit)} defaultValue={unit ?? servingUnit} state={state} />
    </div>
  )
}

function EditForm({ planId, item, servingUnit, onSaved }: { planId: string; item: PlannedFoodView; servingUnit: ServingUnit; onSaved: () => void }) {
  const [state, formAction] = useActionState(updateMealFoodAction.bind(null, planId, item.id), initialFormState)
  useEffect(() => {
    if (state.success) onSaved()
  }, [state, onSaved])
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={{ error: state.error }} />
      <QuantityFields state={state} servingUnit={servingUnit} quantity={item.quantity} unit={item.unit} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save quantity</SubmitButton>
      </div>
    </form>
  )
}

export function AddMealFoodDialog({ planId, mealId, mealName, foods }: { planId: string; mealId: string; mealName: string; foods: FoodOption[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" disabled={foods.length === 0} />}>
        <Plus data-icon="inline-start" />
        Add food
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add food to {mealName}</DialogTitle>
          <DialogDescription>Quantity is in the food&apos;s own unit, or in servings.</DialogDescription>
        </DialogHeader>
        {open && <AddForm planId={planId} mealId={mealId} foods={foods} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

export function EditMealFoodDialog({ planId, item, servingUnit }: { planId: string; item: PlannedFoodView; servingUnit: ServingUnit }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Edit ${item.foodName} quantity`} title="Edit quantity" />}>
        <Pencil />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{item.foodName}</DialogTitle>
          <DialogDescription>Change the planned quantity.</DialogDescription>
        </DialogHeader>
        {open && <EditForm planId={planId} item={item} servingUnit={servingUnit} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}
