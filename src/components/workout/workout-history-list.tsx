import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCalendarDay, formatDuration, formatSet, formatTarget } from "@/lib/workout/format"
import type { WorkoutSessionView } from "@/types/workout"

/**
 * Past workouts: the day, duration and every performed set. `showPlanned`
 * adds the planned target next to the actuals for comparison (no scoring).
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
                  .map((exercise) => (
                    <div key={exercise.id}>
                      <p className="text-sm font-medium">
                        {exercise.exerciseName}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">planned {formatTarget(exercise.planned)}</span>
                      </p>
                      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground tabular-nums">
                        {exercise.sets.map((set) => (
                          <li key={set.id}>{formatSet(set.weight, set.reps, set.weightUnit)}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
