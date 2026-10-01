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
import { removePlannedExerciseAction, reorderPlannedExercisesAction } from "@/server/actions/workout-plan-actions"

/** Move up/down and remove for one planned exercise (reorder sends the day's full new order). */
export function PlannedExerciseControls({
  planId,
  dayId,
  itemId,
  name,
  orderedIds,
}: {
  planId: string
  dayId: string
  itemId: string
  name: string
  orderedIds: string[]
}) {
  const [error, setError] = useState<string>()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const index = orderedIds.indexOf(itemId)

  function move(delta: -1 | 1) {
    const next = [...orderedIds]
    const target = index + delta
    ;[next[index], next[target]] = [next[target], next[index]]
    startTransition(async () => {
      const result = await reorderPlannedExercisesAction(planId, dayId, next)
      setError(result.ok ? undefined : result.error)
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await removePlannedExerciseAction(planId, itemId)
      setError(result.ok ? undefined : result.error)
      setConfirmOpen(false)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center">
        <Button variant="ghost" size="icon-xs" onClick={() => move(-1)} disabled={isPending || index <= 0} aria-label={`Move ${name} up`} title="Move up">
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={() => move(1)} disabled={isPending || index >= orderedIds.length - 1} aria-label={`Move ${name} down`} title="Move down">
          <ArrowDown />
        </Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger render={<Button variant="ghost" size="icon-xs" disabled={isPending} aria-label={`Remove ${name}`} title="Remove exercise" />}>
            <Trash2 />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
              <AlertDialogDescription>It is removed from this workout day. Logged workouts keep their history.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={remove} disabled={isPending}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error && <p role="alert" className="max-w-48 text-right text-xs text-destructive">{error}</p>}
    </div>
  )
}
