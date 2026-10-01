import type { Metadata } from "next"
import Link from "next/link"
import { CheckCircle2, Dumbbell, History, ListChecks, Pencil, Play, TrendingUp } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"
import { DayNavigator, EnsureLocalDate } from "@/components/nutrition/member/day-navigator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CustomizeWorkoutPlanButton } from "@/components/workout/member/customize-workout-plan-button"
import { StartWorkoutButton } from "@/components/workout/member/start-workout-button"
import { WorkoutPageSkeleton } from "@/components/workout/member/workout-page-skeleton"
import { isCalendarDate } from "@/lib/nutrition/calendar-date"
import { formatCalendarDay, formatDuration, formatRest, formatTarget } from "@/lib/workout/format"
import { requireMember } from "@/server/auth/session"
import { selfTarget } from "@/server/services/nutrition/member-target"
import { getWorkoutDayOverview } from "@/server/services/workout/workout-session-service"

export const metadata: Metadata = { title: "Workouts" }

/**
 * The member's workouts for one LOCAL calendar day, taken from `?date=`.
 * Without a date the browser redirects to its own today — the server never
 * derives it. "Today's workout" is the next day in the plan's rotation.
 */
export default async function WorkoutsPage({ searchParams }: PageProps<"/workouts">) {
  const member = await requireMember()
  const { date } = await searchParams

  if (!isCalendarDate(date)) {
    return (
      <>
        <EnsureLocalDate basePath="/workouts" />
        <WorkoutPageSkeleton />
      </>
    )
  }

  const overview = await getWorkoutDayOverview(selfTarget(member), date)
  const { plan, inProgress, completedToday, suggestedDayId } = overview
  const days = plan?.plan.days ?? []
  const suggested = days.find((d) => d.id === suggestedDayId)
  const canStart = !inProgress

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workouts"
        description={formatCalendarDay(date)}
        actions={
          <>
            <DayNavigator date={date} basePath="/workouts" />
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/workouts/plans" />}>
              <ListChecks data-icon="inline-start" />
              My plans
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/workouts/progress" />}>
              <TrendingUp data-icon="inline-start" />
              Progress
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/workouts/history" />}>
              <History data-icon="inline-start" />
              History
            </Button>
          </>
        }
      />

      {inProgress && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Workout in progress</CardTitle>
            <CardDescription>
              {inProgress.dayName} · {formatCalendarDay(inProgress.date)}
            </CardDescription>
            <CardAction>
              <Button nativeButton={false} render={<Link href={`/workouts/session/${inProgress.id}`} />}>
                <Play data-icon="inline-start" />
                Resume
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
      )}

      {!plan ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Dumbbell}
              title="No workout plan for this day."
              description="Your gym can assign you one, or you can create your own."
              action={
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/workouts/plans" />}>
                  My workout plans
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* PLANNED: what's next in the rotation */}
          <Card>
            <CardHeader>
              <CardTitle>{suggested ? `Today's workout: ${suggested.name}` : plan.plan.name}</CardTitle>
              <CardDescription>
                {plan.plan.name}
                {plan.assignment.workoutPlanKind === "PERSONAL" ? " · your own plan" : " · from your gym"}
              </CardDescription>
              <CardAction className="flex flex-wrap items-start justify-end gap-2">
                {plan.assignment.workoutPlanKind === "PERSONAL" ? (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/workouts/plans/${plan.plan.id}`} />}>
                    <Pencil data-icon="inline-start" />
                    Edit my plan
                  </Button>
                ) : (
                  plan.assignment.status === "ACTIVE" && <CustomizeWorkoutPlanButton planName={plan.plan.name} />
                )}
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              {!suggested ? (
                <p className="text-sm text-muted-foreground">This plan has no workouts with exercises yet.</p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {suggested.exercises.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                        <span className="truncate font-medium">{e.exerciseName}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {formatTarget(e)}
                          {e.restSeconds != null && <span className="hidden sm:inline"> · {formatRest(e.restSeconds)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {canStart ? (
                    <StartWorkoutButton date={date} dayId={suggested.id} size="lg" className="w-full sm:w-auto" />
                  ) : (
                    <p className="text-sm text-muted-foreground">Finish or discard your workout in progress to start another.</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* ACTUAL: done today */}
          {completedToday.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Completed this day</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {completedToday.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <CheckCircle2 className="size-4 text-primary" aria-hidden />
                        {s.dayName}
                        {formatDuration(s.durationSeconds) && <span className="font-normal text-muted-foreground">· {formatDuration(s.durationSeconds)}</span>}
                      </span>
                      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/workouts/session/${s.id}`} />}>
                        View
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* All days of the plan */}
          <section aria-labelledby="all-days" className="space-y-3">
            <h2 id="all-days" className="text-lg font-semibold">All workouts in this plan</h2>
            {days.length === 0 ? (
              <p className="text-sm text-muted-foreground">This plan has no workout days yet.</p>
            ) : (
              <ol className="grid gap-4 md:grid-cols-2">
                {days.map((day) => (
                  <li key={day.id}>
                    <Card className="h-full gap-3">
                      <CardHeader>
                        <CardTitle className="flex flex-wrap items-center gap-2">
                          {day.name}
                          {day.id === suggestedDayId && <Badge>Up next</Badge>}
                        </CardTitle>
                        {day.description && <CardDescription>{day.description}</CardDescription>}
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {day.exercises.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No exercises yet.</p>
                        ) : (
                          <ul className="space-y-1 text-sm">
                            {day.exercises.map((e) => (
                              <li key={e.id} className="flex justify-between gap-2">
                                <span className="truncate">{e.exerciseName}</span>
                                <span className="shrink-0 text-muted-foreground tabular-nums">{formatTarget(e)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {canStart && day.exercises.length > 0 && day.id !== suggestedDayId && (
                          <StartWorkoutButton date={date} dayId={day.id} variant="outline" size="default" label="Start this workout" />
                        )}
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  )
}
