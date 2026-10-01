import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string
  unit?: string
  icon: LucideIcon
  helper?: string
  /** 0–100. Renders a progress bar when provided. */
  progress?: number
  /** Tailwind classes for the icon badge, e.g. "bg-chart-2/15 text-chart-2". */
  accentClassName?: string
}

export function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  helper,
  progress,
  accentClassName = "bg-primary/10 text-primary",
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg",
              accentClassName
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
          {unit && (
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {unit}
            </span>
          )}
        </p>
        {progress !== undefined && (
          <Progress value={progress} aria-label={`${label} progress`} />
        )}
        {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
      </CardContent>
    </Card>
  )
}

export function StatCardSkeleton() {
  return (
    <Card aria-hidden>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-1 w-full" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}
