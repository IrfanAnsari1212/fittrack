import { Beef, Flame } from "lucide-react"

import { NutritionTotalsLine } from "@/components/nutrition/nutrition-totals"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { GoalProgress, NutritionTotals } from "@/lib/nutrition/calculations"
import { formatAmount } from "@/lib/nutrition/format"
import { cn } from "@/lib/utils"

function ProgressTile({
  label,
  unit,
  icon: Icon,
  progress,
  consumed,
  accentClassName,
}: {
  label: string
  unit: string
  icon: typeof Flame
  progress: GoalProgress | null
  consumed: number
  accentClassName: string
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span className={cn("flex size-8 items-center justify-center rounded-lg", accentClassName)}>
            <Icon className="size-4" aria-hidden />
          </span>
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {formatAmount(consumed)}
          {progress && (
            <span className="text-base font-normal text-muted-foreground"> / {formatAmount(progress.target)}</span>
          )}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
        </p>
        {progress ? (
          <>
            <Progress value={progress.percent} aria-label={`${label} progress`} />
            <p className={cn("text-xs", progress.over > 0 ? "font-medium text-chart-5" : "text-muted-foreground")}>
              {progress.over > 0
                ? `${formatAmount(progress.over)} ${unit} over goal`
                : progress.remaining === 0
                  ? "Goal reached"
                  : `${formatAmount(progress.remaining)} ${unit} remaining`}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No goal set</p>
        )}
      </CardContent>
    </Card>
  )
}

/** ACTUAL consumption vs goal for the day (never planned totals). */
export function DailySummary({
  consumed,
  progress,
}: {
  consumed: NutritionTotals
  progress: { calories: GoalProgress; protein: GoalProgress } | null
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <ProgressTile label="Calories eaten" unit="kcal" icon={Flame} consumed={consumed.calories} progress={progress?.calories ?? null} accentClassName="bg-primary/10 text-primary" />
        <ProgressTile label="Protein eaten" unit="g" icon={Beef} consumed={consumed.protein} progress={progress?.protein ?? null} accentClassName="bg-chart-2/15 text-chart-2" />
      </div>
      {(consumed.carbs != null || consumed.fat != null) && (
        <NutritionTotalsLine totals={consumed} className="px-1" />
      )}
    </div>
  )
}
