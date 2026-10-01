import { DashboardCardSkeleton } from "@/components/dashboard/dashboard-card"
import { NutritionStats } from "@/components/dashboard/nutrition-stats"
import { ProgressOverviewCard } from "@/components/dashboard/progress-overview-card"
import { RecoverySummaryCard } from "@/components/dashboard/recovery-summary-card"
import { StatCardSkeleton } from "@/components/dashboard/stat-card"
import { TodaysMealsCard } from "@/components/dashboard/todays-meals-card"
import { TodaysWorkoutCard } from "@/components/dashboard/todays-workout-card"
import { WeightSummaryCard } from "@/components/dashboard/weight-summary-card"
import type { DashboardData } from "@/types/dashboard"

/** Dashboard grid. Layout lives here so the page stays a thin data loader. */
export function DashboardOverview({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-6">
      <NutritionStats data={data.nutrition} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TodaysMealsCard meals={data.meals} />
        <TodaysWorkoutCard workout={data.workout} />
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <RecoverySummaryCard recovery={data.recovery} />
        <WeightSummaryCard weight={data.weight} />
        <div className="md:col-span-2 xl:col-span-1">
          <ProgressOverviewCard goals={data.goals} />
        </div>
      </div>
    </div>
  )
}

export function DashboardOverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardCardSkeleton rows={4} />
        <DashboardCardSkeleton rows={4} />
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <DashboardCardSkeleton />
        <DashboardCardSkeleton />
        <DashboardCardSkeleton className="md:col-span-2 xl:col-span-1" />
      </div>
    </div>
  )
}
