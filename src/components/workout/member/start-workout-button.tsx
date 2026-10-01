"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { startWorkoutAction } from "@/server/actions/workout-actions"

/**
 * Start a workout from one day of my plan. `date` is my local calendar day
 * (from the page URL, which the browser supplied) — never the server's.
 */
export function StartWorkoutButton({
  date,
  dayId,
  variant = "default",
  size = "default",
  className,
  label = "Start workout",
}: {
  date: string
  dayId: string
  variant?: "default" | "outline"
  size?: "default" | "lg"
  className?: string
  label?: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  function start() {
    startTransition(async () => {
      const result = await startWorkoutAction(date, dayId)
      if (result.ok && result.data) {
        router.push(`/workouts/session/${result.data.sessionId}`)
      } else if (!result.ok) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="space-y-1">
      <Button variant={variant} size={size} className={className} onClick={start} disabled={isPending}>
        {isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />}
        {isPending ? "Starting…" : label}
      </Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
