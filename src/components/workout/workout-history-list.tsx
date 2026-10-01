import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCalendarDay, formatDuration, formatReps, formatSet, formatSigned, formatTarget, formatWeight } from "@/lib/workout/format"
import { plannedVsActual } from "@/lib/workout/performance"
import type { WorkoutSessionView } from "@/types/workout"

/**
 * Past workouts: the day, duration and every performed set, with the planned
 * target from the workout's own snapshot next to what was actually done
 * (a plain difference, no scoring).
 */
export function WorkoutHistoryList({ sessions }: { sessions: WorkoutSessionView[] }) {
  return (
    <ul className="space-y-4">
      {sessions.map((session) => {
        const sets = session.exercises.reduce((n, e) => n + e.sets.length, 0)
        return (
          <li key={session.id}>
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {formatCalendarDay(session.date)}
                  <Badge variant="secondary">{session.dayName}</Badge>
                </CardTitle>
                <CardDescription>
                  {session.planName}
                  {formatDuration(session.durationSeconds) && <> · {formatDuration(session.durationSeconds)}</>} · {sets}{" "}
                  {sets === 1 ? "set" : "sets"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {session.exercises
                  .filter((e) => e.sets.length > 0)
                  .map((exercise) => {
                    const comparison = plannedVsActual(
                      exercise.planned,
                      exercise.sets.filter((s) => s.completed).map((s) => ({ weight: s.weight, weightUnit: s.weightUnit, reps: s.reps }))
                    )
                    const delta = comparison ? formatSigned(comparison.weightDiff, comparison.unit) : null
                    return (
                    <div key={exercise.id}>
                      <p className="text-sm font-medium">
                        {exercise.exerciseName}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">planned {formatTarget(exercise.planned)}</span>
                      </p>
                      {comparison && exercise.planned.targetWeight != null && comparison.actualWeight != null && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          Planned {formatWeight(exercise.planned.targetWeight, exercise.planned.weightUnit)} × {formatReps(exercise.planned.repsMin, exercise.planned.repsMax)} → actual{" "}
                          {formatWeight(comparison.actualWeight, comparison.unit)} × {comparison.actualReps}
                          {delta && <> ({delta})</>}
                        </p>
                      )}
                      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground tabular-nums">
                        {exercise.sets.map((set) => (
                          <li key={set.id}>{formatSet(set.weight, set.reps, set.weightUnit)}</li>
                        ))}
                      </ul>
                    </div>
                    )
                  })}
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
