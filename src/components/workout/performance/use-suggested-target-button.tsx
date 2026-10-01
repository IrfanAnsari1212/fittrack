"use client"

import { useState, useTransition } from "react"
import { Target } from "lucide-react"

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
import type { WeightUnit } from "@/lib/workout/constants"
import { applySuggestedTargetAction } from "@/server/actions/performance-actions"

/**
 * Explicit opt-in: the plan changes ONLY when the member confirms here.
 * It updates the target weight of this exercise in their own personal plan;
 * past workouts keep what was planned back then.
 */
export function UseSuggestedTargetButton({
  plannedExerciseId,
  exerciseName,
  weight,
  unit,
}: {
  plannedExerciseId: string
  exerciseName: string
  weight: number
  unit: WeightUnit
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string }>()
  const [isPending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const result = await applySuggestedTargetAction(plannedExerciseId, weight, unit)
      setMessage(result.ok ? { ok: true, text: `Target updated to ${weight} ${unit}.` } : { ok: false, text: result.error })
      setOpen(false)
    })
  }

  return (
    <div className="space-y-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={isPending} />}>
          <Target data-icon="inline-start" />
          Use {weight} {unit}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Set {exerciseName} target to {weight} {unit}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This changes the planned target weight in your own workout plan. Your finished workouts are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={isPending}>
              {isPending ? "Updating…" : "Update my plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
          {message.text}
        </p>
      )}
    </div>
  )
}
