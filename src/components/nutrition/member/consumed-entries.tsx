"use client"

import { useState, useTransition } from "react"
import { Check, Pencil, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatQuantity } from "@/lib/nutrition/format"
import { removeConsumedEntryAction, updateConsumedEntryAction } from "@/server/actions/nutrition-actions"
import type { ConsumedEntryView } from "@/types/nutrition"

function EntryRow({ date, entry, mealName }: { date: string; entry: ConsumedEntryView; mealName?: string }) {
  const [editing, setEditing] = useState(false)
  const [quantity, setQuantity] = useState(String(entry.quantity))
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await updateConsumedEntryAction(date, entry.id, quantity)
      if (result.ok) {
        setEditing(false)
        setError(undefined)
      } else setError(result.fieldErrors ? "Enter a quantity greater than 0." : result.error)
    })
  }

  function remove() {
    if (!window.confirm(`Remove ${entry.name} from this day?`)) return
    startTransition(async () => {
      const result = await removeConsumedEntryAction(date, entry.id)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <li className="space-y-1 px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {entry.name}
            {!editing && <span className="font-normal text-muted-foreground"> × {formatQuantity(entry.quantity, entry.unit)}</span>}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {entry.calories} kcal · {entry.protein} g protein
            {mealName && ` · ${mealName}`}
          </p>
        </div>
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              aria-label={`${entry.name} quantity`}
              className="h-7 w-20"
            />
            <Button variant="ghost" size="icon-sm" onClick={save} disabled={isPending} aria-label="Save quantity"><Check /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(false); setQuantity(String(entry.quantity)) }} aria-label="Cancel"><X /></Button>
          </div>
        ) : (
          <div className="flex items-center">
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} disabled={isPending} aria-label={`Edit ${entry.name}`}><Pencil /></Button>
            <Button variant="ghost" size="icon-sm" onClick={remove} disabled={isPending} aria-label={`Remove ${entry.name}`}><Trash2 /></Button>
          </div>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </li>
  )
}

/**
 * What the member actually ate. Values are the snapshot taken when logged —
 * editing the quantity rescales that snapshot, never the current food data.
 */
export function ConsumedEntries({
  date,
  entries,
  mealNames,
}: {
  date: string
  entries: ConsumedEntryView[]
  mealNames: Record<string, string>
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing logged for this day yet.</p>
  }
  return (
    <ul className="divide-y rounded-lg border">
      {entries.map((entry) => (
        <EntryRow
          key={entry.id}
          date={date}
          entry={entry}
          mealName={entry.dietPlanMealId ? mealNames[entry.dietPlanMealId] : undefined}
        />
      ))}
    </ul>
  )
}
