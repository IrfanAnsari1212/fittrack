"use client"

import { useState, useTransition } from "react"
import { Archive, ArchiveRestore } from "lucide-react"

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
import { setWorkoutPlanArchivedAction } from "@/server/actions/workout-plan-actions"

export function WorkoutPlanArchiveButton({ planId, archived }: { planId: string; archived: boolean }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const result = await setWorkoutPlanArchivedAction(planId, !archived)
      setError(result.ok ? undefined : result.error)
      setOpen(false)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="outline" disabled={isPending} />}>
          {archived ? <ArchiveRestore data-icon="inline-start" /> : <Archive data-icon="inline-start" />}
          {archived ? "Restore" : "Archive"}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{archived ? "Restore this plan?" : "Archive this plan?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {archived
                ? "The plan becomes editable and can be used again."
                : "Archived plans are read-only and can't be newly assigned. Members already on this plan keep it, and logged workouts are not affected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={isPending}>
              {archived ? "Restore" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
