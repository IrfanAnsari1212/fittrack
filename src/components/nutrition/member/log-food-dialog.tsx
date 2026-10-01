"use client"

import { useMemo, useState, useTransition } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { formatServing, unitOptionsFor } from "@/lib/nutrition/format"
import type { ServingUnit } from "@/lib/nutrition/units"
import { logConsumptionAction } from "@/server/actions/nutrition-actions"
import type { FoodView } from "@/types/nutrition"

type FoodOption = Pick<FoodView, "id" | "name" | "servingSize" | "servingUnit">

/** Log any food from the gym library — including foods not in the plan. */
export function LogFoodDialog({ date, foods }: { date: string; foods: FoodOption[] }) {
  const [open, setOpen] = useState(false)
  const [foodId, setFoodId] = useState(foods[0]?.id ?? "")
  const [quantity, setQuantity] = useState("1")
  const [unit, setUnit] = useState<ServingUnit>(foods[0]?.servingUnit ?? "serving")
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()
  const food = useMemo(() => foods.find((f) => f.id === foodId), [foods, foodId])

  function chooseFood(id: string) {
    setFoodId(id)
    setUnit(foods.find((f) => f.id === id)?.servingUnit ?? "serving")
  }

  function submit() {
    startTransition(async () => {
      const result = await logConsumptionAction(date, { items: [{ foodId, quantity, unit }] })
      if (result.ok) {
        setOpen(false)
        setQuantity("1")
        setError(undefined)
      } else {
        setError(result.fieldErrors ? "Enter a quantity greater than 0." : result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={foods.length === 0} />}>
        <Plus data-icon="inline-start" />
        Log other food
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Log food</DialogTitle>
          <DialogDescription>Anything you ate, planned or not.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="log-food">Food</Label>
            <NativeSelect id="log-food" value={foodId} onChange={(e) => chooseFood(e.target.value)} className="w-full">
              {foods.map((f) => (
                <NativeSelectOption key={f.id} value={f.id}>{f.name}</NativeSelectOption>
              ))}
            </NativeSelect>
            {food && <p className="text-xs text-muted-foreground">Nutrition {formatServing(food.servingSize, food.servingUnit)}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="log-quantity">Quantity</Label>
              <Input id="log-quantity" type="number" step="any" min="0" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="log-unit">Unit</Label>
              <NativeSelect id="log-unit" value={unit} onChange={(e) => setUnit(e.target.value as ServingUnit)} className="w-full">
                {unitOptionsFor(food?.servingUnit ?? "serving").map((u) => (
                  <NativeSelectOption key={u.value} value={u.value}>{u.label}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !foodId}>
            {isPending ? "Saving…" : "Log food"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
