import { DashboardCardSkeleton } from "@/components/dashboard/dashboard-card"
import { StatCardSkeleton } from "@/components/dashboard/stat-card"
import { Skeleton } from "@/components/ui/skeleton"

export function NutritionPageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading nutrition">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <DashboardCardSkeleton rows={4} />
        <DashboardCardSkeleton rows={3} />
      </div>
    </div>
  )
}
