"use client"

import { useState, useTransition } from "react"

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
import { localCalendarDate } from "@/lib/nutrition/local-date"
import { endWorkoutAssignmentAction } from "@/server/actions/member-workout-admin-actions"

type EndStatus = "COMPLETED" | "CANCELLED"

/** End the active assignment "today" — the admin's local date, from the browser. */
export function EndWorkoutAssignmentButtons({ memberId, assignmentId, planName }: { memberId: string; assignmentId: string; planName: string }) {
  const [pending, setPending] = useState<EndStatus | null>(null)
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  function confirm(status: EndStatus) {
    startTransition(async () => {
      const result = await endWorkoutAssignmentAction(memberId, assignmentId, { status, endDate: localCalendarDate() })
      setError(result.ok ? undefined : result.error)
      setPending(null)
    })
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {(["COMPLETED", "CANCELLED"] as const).map((status) => (
          <AlertDialog key={status} open={pending === status} onOpenChange={(open) => setPending(open ? status : null)}>
            <AlertDialogTrigger render={<Button variant={status === "COMPLETED" ? "outline" : "ghost"} size="sm" disabled={isPending} />}>
              {status === "COMPLETED" ? "Mark completed" : "Cancel plan"}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{status === "COMPLETED" ? `Complete “${planName}”?` : `Cancel “${planName}”?`}</AlertDialogTitle>
                <AlertDialogDescription>The assignment ends today (your local date). The member&apos;s logged workouts are kept.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>Keep it</AlertDialogCancel>
                <AlertDialogAction variant={status === "CANCELLED" ? "destructive" : "default"} onClick={() => confirm(status)} disabled={isPending}>
                  {status === "COMPLETED" ? "Mark completed" : "Cancel plan"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
