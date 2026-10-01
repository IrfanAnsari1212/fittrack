import { Medal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatAmountWithUnit, formatShortDay, formatSigned } from "@/lib/workout/format"
import type { RecordKind } from "@/lib/workout/performance"
import type { SessionExercisePerformance } from "@/types/performance"

const RECORD_NAMES: Record<RecordKind, string> = {
  weight: "Best weight",
  reps: "Best reps",
  e1rm: "Estimated 1RM",
  volume: "Best session volume",
}

/** After a finished workout: how each exercise compares with the previous comparable session. */
export function SessionPerformance({ performance }: { performance: SessionExercisePerformance[] }) {
  if (performance.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>How this workout compares</CardTitle>
        <CardDescription>Against your previous session of each exercise. Facts only — nothing here changes your plan.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {performance.map((p) => {
            const c = p.comparison
            const parts = c
              ? [
                  c.bestWeightDiff != null && `weight ${formatSigned(c.bestWeightDiff, p.unit)}`,
                  c.repsAtSameWeightDiff != null && `reps at same weight ${formatSigned(c.repsAtSameWeightDiff, "")}`,
                  c.volumeDiff != null && `volume ${formatSigned(c.volumeDiff, p.unit)}`,
                  c.e1rmDiff != null && `est. 1RM ${formatSigned(c.e1rmDiff, p.unit)}`,
                ].filter(Boolean)
              : []
            return (
              <li key={p.exerciseId} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {p.exerciseName}
                  {p.newRecords.map((k) => (
                    <Badge key={k} variant="secondary">
                      <Medal data-icon="inline-start" />
                      New {RECORD_NAMES[k].toLowerCase()}
                    </Badge>
                  ))}
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  Volume {formatAmountWithUnit(p.current.metrics.totalVolume == null ? null : Math.round(p.current.metrics.totalVolume), p.unit)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {p.previous
                    ? parts.length > 0
                      ? `vs ${formatShortDay(p.previous.date)}: ${parts.join(" · ")}`
                      : `vs ${formatShortDay(p.previous.date)}: nothing comparable`
                    : "Not enough history to compare yet."}
                </p>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
