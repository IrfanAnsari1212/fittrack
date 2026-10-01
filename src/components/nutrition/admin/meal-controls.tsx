"use client"

import { useState, useTransition } from "react"
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { deleteMealAction, reorderMealsAction } from "@/server/actions/diet-plan-actions"

/**
 * Move up/down and delete for one meal. Reordering sends the full new order
 * of meal ids; the server checks it matches the plan's meals exactly.
 */
export function MealControls({
  planId,
  mealId,
  mealName,
  orderedMealIds,
}: {
  planId: string
  mealId: string
  mealName: string
  orderedMealIds: string[]
}) {
  const [error, setError] = useState<string>()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const index = orderedMealIds.indexOf(mealId)

  function move(delta: -1 | 1) {
    const next = [...orderedMealIds]
    const target = index + delta
    ;[next[index], next[target]] = [next[target], next[index]]
    startTransition(async () => {
      const result = await reorderMealsAction(planId, next)
      setError(result.ok ? undefined : result.error)
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteMealAction(planId, mealId)
      setError(result.ok ? undefined : result.error)
      setConfirmOpen(false)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center">
        <Button variant="ghost" size="icon-sm" onClick={() => move(-1)} disabled={isPending || index <= 0} aria-label={`Move ${mealName} up`} title="Move up">
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => move(1)} disabled={isPending || index >= orderedMealIds.length - 1} aria-label={`Move ${mealName} down`} title="Move down">
          <ArrowDown />
        </Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" disabled={isPending} aria-label={`Delete ${mealName}`} title="Delete meal" />}>
            <Trash2 />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {mealName}?</AlertDialogTitle>
              <AlertDialogDescription>
                The meal and all its planned foods are removed from this plan. Members&apos; logged history is not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={remove} disabled={isPending}>
                Delete meal
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
