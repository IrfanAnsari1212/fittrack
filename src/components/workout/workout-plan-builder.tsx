import Link from "next/link"
import { ArrowLeft, Dumbbell, Info } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AddPlannedExerciseDialog, EditPlannedExerciseDialog, type ExerciseOption } from "@/components/workout/planned-exercise-dialog"
import { PlannedExerciseControls } from "@/components/workout/planned-exercise-controls"
import { WorkoutDayControls } from "@/components/workout/workout-day-controls"
import { WorkoutDayDialog } from "@/components/workout/workout-day-dialog"
import { formatRest, formatTarget } from "@/lib/workout/format"
import type { WorkoutPlanDetail } from "@/types/workout"

/**
 * Plan → workout days → planned exercises, with editing controls when
 * `editable`. Shared by the Gym Admin builder (gym plans) and the member's
 * own plans; the controls call role-aware actions and the server decides
 * what may change. This is the PLAN — what should be done, not what was done.
 */
export function WorkoutPlanBuilder({
  plan,
  exercises,
  editable,
  notice,
  headerActions,
  backHref,
  backLabel,
}: {
  plan: WorkoutPlanDetail
  /** ACTIVE exercises the viewer can pick from. */
  exercises: ExerciseOption[]
  editable: boolean
  notice?: React.ReactNode
  headerActions?: React.ReactNode
  backHref: string
  backLabel: string
}) {
  const orderedDayIds = plan.days.map((d) => d.id)
  const exerciseCount = plan.days.reduce((n, d) => n + d.exercises.length, 0)

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={backHref} />}>
        <ArrowLeft data-icon="inline-start" />
        {backLabel}
      </Button>
      <PageHeader title={plan.name} description={plan.description ?? undefined} actions={headerActions} />

      {notice && (
        <Alert>
          <Info />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge status={plan.status} />
        {plan.ownerUserId && <Badge variant="outline">Personal plan</Badge>}
        <span>
          {plan.days.length} {plan.days.length === 1 ? "workout day" : "workout days"} · {exerciseCount}{" "}
          {exerciseCount === 1 ? "exercise" : "exercises"}
        </span>
      </div>

      <section aria-labelledby="days-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="days-heading" className="text-lg font-semibold">Workout days</h2>
          {editable && <WorkoutDayDialog planId={plan.id} />}
        </div>

        {editable && exercises.length === 0 && (
          <Alert>
            <Info />
            <AlertDescription>Your gym&apos;s exercise library is empty, so there are no exercises to add yet.</AlertDescription>
          </Alert>
        )}

        {plan.days.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No workout days yet"
            description={editable ? "Add your first workout day, e.g. Push, Pull or Legs." : undefined}
          />
        ) : (
          <ol className="space-y-4">
            {plan.days.map((day, index) => {
              const orderedItemIds = day.exercises.map((e) => e.id)
              return (
                <li key={day.id}>
                  <Card className="gap-3">
                    <CardHeader>
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="tabular-nums">{index + 1}</Badge>
                        {day.name}
                      </CardTitle>
                      {day.description && <CardDescription>{day.description}</CardDescription>}
                      {editable && (
                        <CardAction className="flex items-start gap-1">
                          <WorkoutDayDialog planId={plan.id} day={day} />
                          <WorkoutDayControls planId={plan.id} dayId={day.id} dayName={day.name} orderedDayIds={orderedDayIds} />
                        </CardAction>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {day.exercises.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No exercises in this workout yet.</p>
                      ) : (
                        <ul className="divide-y rounded-lg border">
                          {day.exercises.map((item) => (
                            <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {item.exerciseName}
                                  {item.exerciseStatus === "ARCHIVED" && <Badge variant="outline" className="ml-2">Archived exercise</Badge>}
                                </p>
                                <p className="text-sm text-muted-foreground tabular-nums">
                                  {formatTarget(item)}
                                  {formatRest(item.restSeconds) && <> · {formatRest(item.restSeconds)}</>}
                                </p>
                                {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                              </div>
                              {editable && (
                                <div className="flex items-center">
                                  <EditPlannedExerciseDialog planId={plan.id} item={item} />
                                  <PlannedExerciseControls planId={plan.id} dayId={day.id} itemId={item.id} name={item.exerciseName} orderedIds={orderedItemIds} />
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {editable && <AddPlannedExerciseDialog planId={plan.id} dayId={day.id} dayName={day.name} exercises={exercises} />}
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
