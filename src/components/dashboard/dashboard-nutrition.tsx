"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Beef, CheckCircle2, Circle, Flame, Utensils } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { DashboardCard, DashboardCardSkeleton } from "@/components/dashboard/dashboard-card"
import { StatCard, StatCardSkeleton } from "@/components/dashboard/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ActionResult } from "@/lib/form-state"
import type { GoalProgress } from "@/lib/nutrition/calculations"
import { formatAmount } from "@/lib/nutrition/format"
import { useLocalCalendarDate } from "@/lib/nutrition/use-local-date"
import { cn } from "@/lib/utils"
import { getNutritionDayAction } from "@/server/actions/nutrition-actions"
import type { NutritionDayView } from "@/types/nutrition"

function helperText(progress: GoalProgress | undefined, unit: string) {
  if (!progress) return "No goal set"
  if (progress.over > 0) return `${formatAmount(progress.over)} ${unit} over goal`
  if (progress.remaining === 0) return "Goal reached"
  return `${formatAmount(progress.remaining)} ${unit} remaining`
}

/**
 * Real nutrition for the member's LOCAL today. The dashboard is server
 * rendered without knowing the member's day, so this widget asks the
 * browser for the date and fetches it via a server action.
 */
export function DashboardNutrition({ besideMeals }: { besideMeals: React.ReactNode }) {
  const date = useLocalCalendarDate()
  const [result, setResult] = useState<{ date: string; value: ActionResult<NutritionDayView> }>()

  useEffect(() => {
    if (!date) return
    let cancelled = false
    getNutritionDayAction(date).then((value) => {
      if (!cancelled) setResult({ date, value })
    })
    return () => {
      cancelled = true
    }
  }, [date])

  const loaded = result?.date === date ? result.value : undefined
  if (!loaded) {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <DashboardCardSkeleton rows={4} />
          {besideMeals}
        </div>
      </>
    )
  }

  if (!loaded.ok) {
    return (
      <>
        <p role="alert" className="text-sm text-destructive">Couldn&apos;t load today&apos;s nutrition. {loaded.error}</p>
        <div className="grid gap-6 lg:grid-cols-2">{besideMeals}</div>
      </>
    )
  }

  const day = loaded.data!
  const meals = day.plan?.plan.meals ?? []
  const done = new Set(day.completedMealIds)
  const href = `/nutrition?date=${day.date}`

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Calories today"
          value={day.goal ? `${formatAmount(day.consumed.calories)} / ${formatAmount(day.goal.dailyCalories)}` : formatAmount(day.consumed.calories)}
          unit="kcal"
          icon={Flame}
          progress={day.progress?.calories.percent}
          helper={helperText(day.progress?.calories, "kcal")}
        />
        <StatCard
          label="Protein today"
          value={day.goal ? `${formatAmount(day.consumed.protein)} / ${formatAmount(day.goal.dailyProtein)}` : formatAmount(day.consumed.protein)}
          unit="g"
          icon={Beef}
          accentClassName="bg-chart-2/15 text-chart-2"
          progress={day.progress?.protein.percent}
          helper={helperText(day.progress?.protein, "g")}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardCard
          title="Today's meals"
          icon={Utensils}
          action={meals.length > 0 && <Badge variant="secondary">{meals.filter((m) => done.has(m.id)).length}/{meals.length} logged</Badge>}
        >
          {!day.plan ? (
            <EmptyState icon={Utensils} title="No active diet plan for today." action={<Button variant="outline" size="sm" nativeButton={false} render={<Link href={href} />}>Log food</Button>} />
          ) : (
            <div className="space-y-3">
              <ul className="divide-y">
                {meals.map((meal) => {
                  const logged = done.has(meal.id)
                  const Icon = logged ? CheckCircle2 : Circle
                  return (
                    <li key={meal.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                      <Icon className={cn("size-5 shrink-0", logged ? "text-primary" : "text-muted-foreground")} aria-label={logged ? "Logged" : "Not logged yet"} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{meal.name}</p>
                        <p className="text-xs text-muted-foreground">{meal.time}</p>
                      </div>
                      <p className="text-right text-xs text-muted-foreground tabular-nums">
                        {formatAmount(meal.totals.calories)} kcal planned
                      </p>
                    </li>
                  )
                })}
              </ul>
              <Button variant="outline" size="sm" className="w-full" nativeButton={false} render={<Link href={href} />}>
                Open nutrition
              </Button>
            </div>
          )}
        </DashboardCard>
        {besideMeals}
      </div>
    </>
  )
}
