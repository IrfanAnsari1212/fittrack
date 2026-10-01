import { Clock, Dumbbell } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Badge } from "@/components/ui/badge"
import type { WorkoutSummary } from "@/types/dashboard"

export function TodaysWorkoutCard({
  workout,
}: {
  workout: WorkoutSummary | null
}) {
  return (
    <DashboardCard
      title="Today's workout"
      icon={Dumbbell}
      action={
        workout && (
          <Badge variant={workout.completed ? "default" : "outline"}>
            {workout.completed ? "Completed" : "Planned"}
          </Badge>
        )
      }
    >
      {!workout ? (
        <EmptyState
          icon={Dumbbell}
          title="Rest day"
          description="No workout scheduled for today."
        />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="font-medium">{workout.name}</p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{workout.focus}</span>
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {workout.durationMinutes} min
              </span>
            </p>
          </div>
          <ul className="space-y-2">
            {workout.exercises.map((exercise) => (
              <li
                key={exercise.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm"
              >
                <span className="truncate font-medium">{exercise.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {exercise.sets} × {exercise.reps}
                  {exercise.weightKg !== undefined && ` · ${exercise.weightKg} kg`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardCard>
  )
}
