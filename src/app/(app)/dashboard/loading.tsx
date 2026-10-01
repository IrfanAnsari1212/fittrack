import { DashboardOverviewSkeleton } from "@/components/dashboard/dashboard-overview"
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <DashboardOverviewSkeleton />
    </div>
  )
}
