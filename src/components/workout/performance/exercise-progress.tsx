import Link from "next/link"
import { Info, Lightbulb, Medal, TrendingDown, TrendingUp } from "lucide-react"

import { LineChart } from "@/components/charts/line-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UseSuggestedTargetButton } from "@/components/workout/performance/use-suggested-target-button"
import type { RecordKind } from "@/lib/workout/performance"
import { formatAmountWithUnit, formatCalendarDay, formatShortDay, formatSigned } from "@/lib/workout/format"
import type { ExerciseProgressView, ExerciseSessionSummary } from "@/types/performance"

const RECORD_NAMES: Record<RecordKind, string> = {
  weight: "Best weight",
  reps: "Best reps",
  e1rm: "Estimated 1RM",
  volume: "Best session volume",
}

function setsLine(s: ExerciseSessionSummary, unit: string) {
  const line = s.sets.map((set) => `${set.weight ?? "BW"} × ${set.reps}`).join(", ")
  return s.sets.some((x) => x.weight != null) ? `${line} (${unit})` : line
}

function Delta({ diff, unit, label }: { diff: number | null; unit: string; label: string }) {
  const text = formatSigned(diff, unit)
  if (text == null) return null
  const Icon = diff! > 0.05 ? TrendingUp : diff! < -0.05 ? TrendingDown : null
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 font-medium tabular-nums">
        {Icon && <Icon className="size-3.5 text-muted-foreground" aria-hidden />}
        {text}
      </dd>
    </div>
  )
}

/**
 * One exercise's performance, derived from completed workouts. Pure
 * presentation: all numbers come from the performance service. `canApply`
 * enables the explicit "use this target" action (members only).
 */
export function ExerciseProgress({
  progress,
  basePath,
  filter,
  canApply,
}: {
  progress: ExerciseProgressView
  basePath: string
  filter: { from?: string; to?: string }
  canApply: boolean
}) {
  const { unit, latest, previous, comparison, records, recommendation, planTarget } = progress
  const hasRecords = Object.values(records).some((r) => r != null)
  const suggested = recommendation.suggestedWeight
  const showApply = canApply && suggested != null && planTarget && planTarget.currentTargetWeight !== suggested

  if (progress.sessionCount === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">No completed workouts yet for this exercise.</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Current performance */}
        <Card>
          <CardHeader>
            <CardTitle>Latest session</CardTitle>
            <CardDescription>{latest ? formatCalendarDay(latest.date) : "—"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {latest && (
              <>
                <p className="text-lg font-semibold tabular-nums">{setsLine(latest, unit)}</p>
                <p className="text-sm text-muted-foreground">
                  Volume {formatAmountWithUnit(latest.metrics.totalVolume, unit)}
                  {latest.metrics.bestE1rm != null && <> · Estimated 1RM {formatAmountWithUnit(Math.round(latest.metrics.bestE1rm * 10) / 10, unit)}</>}
                </p>
                {progress.recordsInLatest.length > 0 && (
                  <p className="flex flex-wrap items-center gap-1.5 text-sm">
                    <Medal className="size-4 text-primary" aria-hidden />
                    New record:
                    {progress.recordsInLatest.map((k) => (
                      <Badge key={k} variant="secondary">{RECORD_NAMES[k]}</Badge>
                    ))}
                  </p>
                )}
              </>
            )}
            {comparison && previous ? (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">vs. previous session ({formatShortDay(previous.date)})</p>
                <dl className="space-y-1">
                  <Delta diff={comparison.bestWeightDiff} unit={unit} label="Best weight" />
                  <Delta diff={comparison.repsAtSameWeightDiff} unit="reps" label="Reps at same weight" />
                  <Delta diff={comparison.volumeDiff} unit={unit} label="Volume" />
                  <Delta diff={comparison.e1rmDiff} unit={unit} label="Estimated 1RM" />
                </dl>
                <p className="text-xs text-muted-foreground">
                  Previous: {setsLine(previous, unit)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {progress.sessionCount === 1 ? "Complete more sessions to compare your progress." : "Not enough history to compare yet."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Personal records */}
        <Card>
          <CardHeader>
            <CardTitle>Personal records</CardTitle>
            <CardDescription>Best of all your completed workouts.</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasRecords ? (
              <p className="text-sm text-muted-foreground">No personal records yet.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-4">
                {[
                  { name: RECORD_NAMES.weight, value: records.highestWeight && formatAmountWithUnit(records.highestWeight.value, unit), date: records.highestWeight?.date, extra: records.highestWeight && `× ${records.highestWeight.reps}` },
                  { name: RECORD_NAMES.reps, value: records.highestReps && `${records.highestReps.value} reps`, date: records.highestReps?.date, extra: records.highestReps?.weight != null ? `@ ${records.highestReps.weight} ${unit}` : records.highestReps ? "bodyweight" : undefined },
                  { name: RECORD_NAMES.e1rm, value: records.highestE1rm && formatAmountWithUnit(Math.round(records.highestE1rm.value * 10) / 10, unit), date: records.highestE1rm?.date, extra: records.highestE1rm && `${records.highestE1rm.weight} × ${records.highestE1rm.reps}` },
                  { name: RECORD_NAMES.volume, value: records.highestVolume && formatAmountWithUnit(Math.round(records.highestVolume.value), unit), date: records.highestVolume?.date },
                ].map((r) => (
                  <div key={r.name} className="space-y-0.5">
                    <dt className="text-xs text-muted-foreground">{r.name}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{r.value || "—"}</dd>
                    {r.date && (
                      <dd className="text-xs text-muted-foreground">
                        {r.extra && <>{r.extra} · </>}
                        {formatShortDay(r.date)}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            )}
            {records.highestE1rm && (
              <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Estimated 1RM is calculated from your sets (Epley formula, sets of 1–12 reps). It is not a tested one-rep max.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recommendation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="size-4 text-muted-foreground" aria-hidden />
            Recommendation
          </CardTitle>
          <CardDescription>A suggestion only — your plan never changes unless you choose to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{recommendation.observation}</p>
          {recommendation.suggestion ? (
            <p className="text-sm font-medium">{recommendation.suggestion}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No recommendation yet.</p>
          )}
          {recommendation.suggestion && suggested != null && (
            <p className="text-sm text-muted-foreground">
              Based on your own earlier increases, a next target of {suggested} {unit} would follow your usual step.
            </p>
          )}
          {showApply && planTarget.planKind === "PERSONAL" && (
            <UseSuggestedTargetButton plannedExerciseId={planTarget.plannedExerciseId} exerciseName={progress.exerciseName} weight={suggested!} unit={unit} />
          )}
          {canApply && suggested != null && planTarget?.planKind === "GYM" && (
            <p className="text-xs text-muted-foreground">
              This exercise is in your gym&apos;s plan, which only your gym can change.{" "}
              <Link href="/workouts" className="underline underline-offset-4">Customize your plan</Link> first to set your own target.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Trends */}
      <section aria-labelledby="trends-heading" className="space-y-3">
        <h2 id="trends-heading" className="text-lg font-semibold">Trends</h2>
        {progress.series.length < 2 ? (
          <p className="text-sm text-muted-foreground">Complete more sessions to see trends.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { title: "Estimated 1RM", key: "e1rm" as const },
              { title: "Best weight", key: "bestWeight" as const },
              { title: "Session volume", key: "volume" as const },
            ].map((chart) => (
              <Card key={chart.key} className="gap-2">
                <CardHeader>
                  <CardTitle className="text-sm">{chart.title}</CardTitle>
                  <CardDescription>{unit} · last {progress.series.length} sessions</CardDescription>
                </CardHeader>
                <CardContent>
                  <LineChart
                    unit={unit}
                    label={`${chart.title} over your last ${progress.series.length} sessions`}
                    points={progress.series.map((p) => ({ label: formatShortDay(p.date), value: p[chart.key] }))}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recent sessions */}
      <section aria-labelledby="recent-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="recent-heading" className="text-lg font-semibold">Recent sessions</h2>
          <form className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter sessions by date">
            <input type="hidden" name="exercise" value={progress.exerciseId} />
            <div className="space-y-1">
              <Label htmlFor="recent-from" className="text-xs">From</Label>
              <Input id="recent-from" name="from" type="date" defaultValue={filter.from} className="w-auto" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="recent-to" className="text-xs">To</Label>
              <Input id="recent-to" name="to" type="date" defaultValue={filter.to} className="w-auto" />
            </div>
            <Button type="submit" variant="outline" size="sm">Filter</Button>
            {(filter.from || filter.to) && (
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`${basePath}?exercise=${progress.exerciseId}`} />}>Clear</Button>
            )}
          </form>
        </div>
        {progress.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions in this range.</p>
        ) : (
          <Card>
            <CardContent className="px-0 sm:px-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead>Sets (weight × reps)</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Volume</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Est. 1RM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {progress.recent.map((s) => (
                    <TableRow key={s.workoutSessionId}>
                      <TableCell className="whitespace-nowrap">{formatShortDay(s.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.metrics.bestWeight == null ? "BW" : `${Math.round(s.metrics.bestWeight * 10) / 10} ${unit}`}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{s.sets.map((x) => `${x.weight ?? "BW"}×${x.reps}`).join("  ")}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatAmountWithUnit(s.metrics.totalVolume == null ? null : Math.round(s.metrics.totalVolume), unit)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatAmountWithUnit(s.metrics.bestE1rm == null ? null : Math.round(s.metrics.bestE1rm * 10) / 10, unit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
