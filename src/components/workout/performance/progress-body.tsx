import { Dumbbell } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { Card, CardContent } from "@/components/ui/card"
import { ExerciseProgress } from "@/components/workout/performance/exercise-progress"
import { ExerciseSelect } from "@/components/workout/performance/exercise-select"
import { isValidId } from "@/server/tenant"
import { isCalendarDate } from "@/lib/nutrition/calendar-date"
import type { MemberTarget } from "@/server/services/nutrition/member-target"
import { getExerciseProgress, listProgressExercises } from "@/server/services/workout/performance-service"

const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined)
const validDate = (value: string | string[] | undefined) => {
  const v = first(value)
  return v && isCalendarDate(v) ? v : undefined
}

/**
 * Exercise selector + progress for one member, shared by the member page and
 * the (read-only) admin page. `target` is resolved on the server by the page
 * (selfTarget / gymMemberTarget) — nothing about WHOSE data this is comes from
 * the query string. `?exercise=`, `?from=`, `?to=` only narrow what that
 * member sees; they're validated, and an id with no history shows nothing.
 */
export async function ProgressBody({
  target,
  searchParams,
  basePath,
  canApply,
}: {
  target: MemberTarget
  searchParams: Record<string, string | string[] | undefined>
  basePath: string
  canApply: boolean
}) {
  const exercises = await listProgressExercises(target)
  if (exercises.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState icon={Dumbbell} title="No completed workouts yet." description="Finish a workout to see your progress here." />
        </CardContent>
      </Card>
    )
  }

  const requested = first(searchParams.exercise)
  const selected = (requested && isValidId(requested) && exercises.find((e) => e.exerciseId === requested)) || exercises[0]
  let from = validDate(searchParams.from)
  let to = validDate(searchParams.to)
  if (from && to && from > to) [from, to] = [to, from]
  const progress = await getExerciseProgress(target, selected.exerciseId, { from, to })

  return (
    <div className="space-y-6">
      <ExerciseSelect exercises={exercises} selectedId={selected.exerciseId} basePath={basePath} />
      <ExerciseProgress progress={progress} basePath={basePath} filter={{ from, to }} canApply={canApply} />
    </div>
  )
}
