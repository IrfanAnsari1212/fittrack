"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CheckCircle2, Dumbbell, Medal, Play, TrendingUp } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { DashboardCard, DashboardCardSkeleton } from "@/components/dashboard/dashboard-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StartWorkoutButton } from "@/components/workout/member/start-workout-button"
import type { ActionResult } from "@/lib/form-state"
import { useLocalCalendarDate } from "@/lib/nutrition/use-local-date"
import { formatTarget } from "@/lib/workout/format"
import { getPerformanceHighlightAction } from "@/server/actions/performance-actions"
import { getWorkoutDayAction } from "@/server/actions/workout-actions"
import type { PerformanceHighlight } from "@/types/performance"
import type { WorkoutDayOverview } from "@/types/workout"

/**
 * Real workout for the member's LOCAL today. The dashboard is server
 * rendered without knowing the member's day, so this widget asks the browser
 * for the date and fetches the overview through a server action. "Today's
 * workout" is the next day in the plan's rotation; nothing is invented when
 * there is no plan.
 */
export function TodaysWorkoutCard() {
  const date = useLocalCalendarDate()
  const [result, setResult] = useState<{ date: string; value: ActionResult<WorkoutDayOverview> }>()

  useEffect(() => {
    if (!date) return
    let cancelled = false
    getWorkoutDayAction(date).then((value) => {
      if (!cancelled) setResult({ date, value })
    })
    return () => {
      cancelled = true
    }
  }, [date])

  // Latest completed workout's headline (no calendar day involved).
  const [highlight, setHighlight] = useState<PerformanceHighlight | null>(null)
  useEffect(() => {
    let cancelled = false
    getPerformanceHighlightAction().then((value) => {
      if (!cancelled && value.ok) setHighlight(value.data ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const loaded = result?.date === date ? result.value : undefined
  if (!loaded) return <DashboardCardSkeleton rows={4} />

  if (!loaded.ok) {
    return (
      <DashboardCard title="Today's workout" icon={Dumbbell}>
        <p role="alert" className="text-sm text-destructive">Couldn&apos;t load today&apos;s workout. {loaded.error}</p>
      </DashboardCard>
    )
  }

  const overview = loaded.data!
  const progressLine = highlight && (
    <Link href="/workouts/progress" className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50">
      {highlight.kind === "PR" ? <Medal className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> : <TrendingUp className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />}
      <span>
        <span className="font-medium">{highlight.exerciseName}</span>
        <span className="text-muted-foreground"> — {highlight.text}</span>
      </span>
    </Link>
  )
  const href = `/workouts?date=${overview.date}`
  const planDay = overview.plan?.plan.days.find((d) => d.id === overview.suggestedDayId)

  if (overview.inProgress) {
    return (
      <DashboardCard title="Today's workout" icon={Dumbbell} action={<Badge>In progress</Badge>}>
        <div className="space-y-3">
          <p className="font-medium">{overview.inProgress.dayName}</p>
          <Button className="w-full" nativeButton={false} render={<Link href={`/workouts/session/${overview.inProgress.id}`} />}>
            <Play data-icon="inline-start" />
            Resume workout
          </Button>
        </div>
      </DashboardCard>
    )
  }

  if (!planDay) {
    return (
      <DashboardCard title="Today's workout" icon={Dumbbell}>
        <EmptyState
          icon={Dumbbell}
          title="No workout planned for today."
          action={
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={href} />}>
              Open workouts
            </Button>
          }
        />
        {progressLine && <div className="mt-3">{progressLine}</div>}
      </DashboardCard>
    )
  }

  const doneToday = overview.completedToday.length > 0
  const totalSets = planDay.exercises.reduce((n, e) => n + e.sets, 0)

  return (
    <DashboardCard
      title="Today's workout"
      icon={Dumbbell}
      action={
        doneToday ? (
          <Badge variant="default">
            <CheckCircle2 data-icon="inline-start" />
            Done today
          </Badge>
        ) : (
          <Badge variant="outline">Planned</Badge>
        )
      }
    >
      <div className="space-y-4">
        <div>
          <p className="font-medium">{planDay.name}</p>
          <p className="text-sm text-muted-foreground">
            {planDay.exercises.length} {planDay.exercises.length === 1 ? "exercise" : "exercises"} · {totalSets} sets
          </p>
        </div>
        <ul className="space-y-2">
          {planDay.exercises.slice(0, 5).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="truncate font-medium">{e.exerciseName}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{formatTarget(e)}</span>
            </li>
          ))}
          {planDay.exercises.length > 5 && (
            <li className="px-1 text-xs text-muted-foreground">+ {planDay.exercises.length - 5} more</li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2">
          <StartWorkoutButton date={overview.date} dayId={planDay.id} className="flex-1" label={doneToday ? "Start another" : "Start workout"} />
          <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
            Open
          </Button>
        </div>
        {progressLine}
      </div>
    </DashboardCard>
  )
}
