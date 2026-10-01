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
import { deleteWorkoutDayAction, reorderWorkoutDaysAction } from "@/server/actions/workout-plan-actions"

/** Move up/down and delete for one workout day. Reordering sends the full new order of day ids. */
export function WorkoutDayControls({
  planId,
  dayId,
  dayName,
  orderedDayIds,
}: {
  planId: string
  dayId: string
  dayName: string
  orderedDayIds: string[]
}) {
  const [error, setError] = useState<string>()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const index = orderedDayIds.indexOf(dayId)

  function move(delta: -1 | 1) {
    const next = [...orderedDayIds]
    const target = index + delta
    ;[next[index], next[target]] = [next[target], next[index]]
    startTransition(async () => {
      const result = await reorderWorkoutDaysAction(planId, next)
      setError(result.ok ? undefined : result.error)
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteWorkoutDayAction(planId, dayId)
      setError(result.ok ? undefined : result.error)
      setConfirmOpen(false)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center">
        <Button variant="ghost" size="icon-sm" onClick={() => move(-1)} disabled={isPending || index <= 0} aria-label={`Move ${dayName} up`} title="Move up">
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => move(1)} disabled={isPending || index >= orderedDayIds.length - 1} aria-label={`Move ${dayName} down`} title="Move down">
          <ArrowDown />
        </Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" disabled={isPending} aria-label={`Delete ${dayName}`} title="Delete workout day" />}>
            <Trash2 />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {dayName}?</AlertDialogTitle>
              <AlertDialogDescription>
                The workout day and all its planned exercises are removed from this plan. Workouts already logged are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={remove} disabled={isPending}>
                Delete workout day
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
