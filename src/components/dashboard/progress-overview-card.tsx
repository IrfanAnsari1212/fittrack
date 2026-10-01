import { TrendingUp } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Progress } from "@/components/ui/progress"
import { percentOf } from "@/lib/format"
import type { ProgressGoal } from "@/types/dashboard"

export function ProgressOverviewCard({ goals }: { goals: ProgressGoal[] }) {
  return (
    <DashboardCard
      title="Weekly progress"
      icon={TrendingUp}
      description="How this week is going"
    >
      {goals.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No goals yet"
          description="Weekly goals will appear here once you set them."
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          {goals.map((goal) => (
            <li key={goal.id} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{goal.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {goal.current}/{goal.target} {goal.unit}
                </span>
              </div>
              <Progress
                value={percentOf(goal.current, goal.target)}
                aria-label={goal.label}
              />
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}
