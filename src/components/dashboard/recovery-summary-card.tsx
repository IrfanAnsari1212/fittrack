import { Activity, BatteryMedium, Moon, Zap } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { cn } from "@/lib/utils"
import type { RatingScale, RecoverySummary } from "@/types/dashboard"

function RatingDots({ value, label }: { value: RatingScale; label: string }) {
  return (
    <div className="flex gap-1" role="img" aria-label={`${label}: ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cn(
            "h-1.5 w-4 rounded-full",
            n <= value ? "bg-primary" : "bg-muted"
          )}
        />
      ))}
    </div>
  )
}

function MetricRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Moon
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        {label}
      </span>
      {children}
    </div>
  )
}

export function RecoverySummaryCard({
  recovery,
}: {
  recovery: RecoverySummary | null
}) {
  return (
    <DashboardCard title="Recovery" icon={Activity} description="Last night & today">
      {!recovery ? (
        <EmptyState
          icon={BatteryMedium}
          title="No check-in yet"
          description="Log sleep, energy and soreness to see your recovery."
        />
      ) : (
        <div className="space-y-4">
          <MetricRow icon={Moon} label="Sleep">
            <span className="text-sm font-medium tabular-nums">
              {recovery.sleepHours} h
              <span className="font-normal text-muted-foreground">
                {" "}
                / {recovery.sleepTargetHours} h
              </span>
            </span>
          </MetricRow>
          <MetricRow icon={Zap} label="Energy">
            <RatingDots value={recovery.energy} label="Energy" />
          </MetricRow>
          <MetricRow icon={Activity} label="Soreness">
            <RatingDots value={recovery.soreness} label="Soreness" />
          </MetricRow>
          {recovery.note && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {recovery.note}
            </p>
          )}
        </div>
      )}
    </DashboardCard>
  )
}
