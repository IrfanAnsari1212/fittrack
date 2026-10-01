"use client"

import { useState, useTransition } from "react"
import { ClipboardCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatQuantity, unitOptions } from "@/lib/nutrition/format"
import { logConsumptionAction } from "@/server/actions/nutrition-actions"
import type { PlannedMealView } from "@/types/nutrition"

interface Row {
  foodId: string
  name: string
  include: boolean
  quantity: string
  unit: PlannedMealView["foods"][number]["unit"]
  planned: number
}

/**
 * Record what was ACTUALLY eaten for a planned meal. Starts from the planned
 * quantities, which the member can change (e.g. 4 eggs planned → 3 eaten)
 * or untick. Nothing is recorded until the member submits.
 */
export function LogMealDialog({ date, meal, logged }: { date: string; meal: PlannedMealView; logged: boolean }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  function openDialog(next: boolean) {
    if (next) {
      setRows(meal.foods.map((f) => ({ foodId: f.foodId, name: f.foodName, include: true, quantity: String(f.quantity), unit: f.unit, planned: f.quantity })))
      setError(undefined)
    }
    setOpen(next)
  }

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  function submit() {
    const items = rows.filter((r) => r.include).map((r) => ({ foodId: r.foodId, quantity: r.quantity, unit: r.unit }))
    if (items.length === 0) {
      setError("Tick at least one food you ate.")
      return
    }
    startTransition(async () => {
      const result = await logConsumptionAction(date, { dietPlanMealId: meal.id, items })
      if (result.ok) setOpen(false)
      else setError(result.fieldErrors ? `${result.error} (check quantities)` : result.error)
    })
  }

  const unitLabel = (unit: Row["unit"]) => unitOptions.find((u) => u.value === unit)?.label ?? unit

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger render={<Button variant={logged ? "ghost" : "outline"} size="sm" disabled={meal.foods.length === 0} />}>
        <ClipboardCheck data-icon="inline-start" />
        {logged ? "Log more" : "Log this meal"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What did you eat for {meal.name}?</DialogTitle>
          <DialogDescription>Adjust to what you actually ate. Only ticked foods are recorded.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li key={`${row.foodId}-${index}`} className="flex items-center gap-3">
              <input
                type="checkbox"
                id={`include-${index}`}
                checked={row.include}
                onChange={(e) => update(index, { include: e.target.checked })}
                className="size-4 accent-primary"
              />
              <label htmlFor={`include-${index}`} className="min-w-0 flex-1 text-sm">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="text-xs text-muted-foreground">Planned {formatQuantity(row.planned, row.unit)}</span>
              </label>
              <Input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={row.quantity}
                disabled={!row.include}
                onChange={(e) => update(index, { quantity: e.target.value })}
                aria-label={`${row.name} quantity eaten`}
                className="w-20"
              />
              <span className="w-14 text-xs text-muted-foreground">{unitLabel(row.unit)}</span>
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Saving…" : "Record what I ate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
