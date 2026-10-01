import { CheckCircle2, Circle, MinusCircle, Utensils } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Badge } from "@/components/ui/badge"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { MealStatus, MealSummary } from "@/types/dashboard"

const statusConfig: Record<
  MealStatus,
  { label: string; icon: typeof Circle; className: string }
> = {
  completed: { label: "Done", icon: CheckCircle2, className: "text-primary" },
  upcoming: { label: "Upcoming", icon: Circle, className: "text-muted-foreground" },
  skipped: { label: "Skipped", icon: MinusCircle, className: "text-muted-foreground" },
}

export function TodaysMealsCard({ meals }: { meals: MealSummary[] }) {
  const completed = meals.filter((m) => m.status === "completed").length

  return (
    <DashboardCard
      title="Today's meals"
      icon={Utensils}
      action={
        meals.length > 0 && (
          <Badge variant="secondary">
            {completed}/{meals.length} done
          </Badge>
        )
      }
    >
      {meals.length === 0 ? (
        <EmptyState
          icon={Utensils}
          title="No meals planned"
          description="Meals you plan for today will show up here."
        />
      ) : (
        <ul className="divide-y">
          {meals.map((meal) => {
            const status = statusConfig[meal.status]
            const StatusIcon = status.icon
            return (
              <li
                key={meal.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <StatusIcon
                  className={cn("size-5 shrink-0", status.className)}
                  aria-label={status.label}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      meal.status === "skipped" &&
                        "text-muted-foreground line-through"
                    )}
                  >
                    {meal.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(meal.time)}
                  </p>
                </div>
                <div className="text-right text-xs tabular-nums">
                  <p className="font-medium">{meal.calories} kcal</p>
                  <p className="text-muted-foreground">{meal.protein} g protein</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardCard>
  )
}
