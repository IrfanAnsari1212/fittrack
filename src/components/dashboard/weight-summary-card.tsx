import { Scale } from "lucide-react"

import { Sparkline } from "@/components/charts/sparkline"
import { EmptyState } from "@/components/common/empty-state"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Progress } from "@/components/ui/progress"
import { formatSignedDelta, percentOf } from "@/lib/format"
import type { WeightSummary } from "@/types/dashboard"

export function WeightSummaryCard({ weight }: { weight: WeightSummary | null }) {
  if (!weight) {
    return (
      <DashboardCard title="Body weight" icon={Scale}>
        <EmptyState
          icon={Scale}
          title="No weigh-ins yet"
          description="Log your weight to start tracking your trend."
        />
      </DashboardCard>
    )
  }

  const { currentKg, goalKg, startKg, history } = weight
  const first = history[0]?.weightKg ?? currentKg
  const change = currentKg - first
  const goalProgress = percentOf(
    Math.abs(startKg - currentKg),
    Math.abs(startKg - goalKg)
  )

  return (
    <DashboardCard title="Body weight" icon={Scale} description="Last 6 weeks">
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {currentKg.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              kg
            </span>
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatSignedDelta(change)} kg
          </p>
        </div>
        <Sparkline
          values={history.map((p) => p.weightKg)}
          label={`Weight trend from ${first.toFixed(1)} kg to ${currentKg.toFixed(1)} kg`}
        />
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Start {startKg} kg</span>
            <span>Goal {goalKg} kg</span>
          </div>
          <Progress value={goalProgress} aria-label="Progress to goal weight" />
        </div>
      </div>
    </DashboardCard>
  )
}
