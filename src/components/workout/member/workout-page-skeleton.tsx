import { DashboardCardSkeleton } from "@/components/dashboard/dashboard-card"
import { Skeleton } from "@/components/ui/skeleton"

export function WorkoutPageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading workouts">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <DashboardCardSkeleton rows={4} />
      <div className="grid gap-6 md:grid-cols-2">
        <DashboardCardSkeleton rows={3} />
        <DashboardCardSkeleton rows={3} />
      </div>
    </div>
  )
}
