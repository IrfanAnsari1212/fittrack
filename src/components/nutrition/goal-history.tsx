"use client"

import { Badge } from "@/components/ui/badge"
import { formatAmount } from "@/lib/nutrition/format"
import { useLocalCalendarDate } from "@/lib/nutrition/use-local-date"
import type { NutritionGoalView } from "@/types/nutrition"

/**
 * Goal history (newest first). "Current" is the newest goal starting on or
 * before the viewer's LOCAL today — computed in the browser, since the server
 * doesn't know the viewer's day.
 */
export function GoalHistory({ goals }: { goals: NutritionGoalView[] }) {
  const today = useLocalCalendarDate()
  if (goals.length === 0) return <p className="text-sm text-muted-foreground">No nutrition goal has been set yet.</p>
  const currentId = today ? goals.find((g) => g.effectiveFrom <= today)?.id : undefined

  return (
    <ul className="divide-y rounded-lg border text-sm">
      {goals.map((goal) => (
        <li key={goal.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span className="tabular-nums">
            {formatAmount(goal.dailyCalories)} kcal · {formatAmount(goal.dailyProtein)} g protein
            {goal.dailyCarbs != null && ` · ${formatAmount(goal.dailyCarbs)} g carbs`}
            {goal.dailyFat != null && ` · ${formatAmount(goal.dailyFat)} g fat`}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            from {goal.effectiveFrom}
            {goal.id === currentId && <Badge variant="secondary">Current</Badge>}
            {today && goal.effectiveFrom > today && <Badge variant="outline">Upcoming</Badge>}
          </span>
        </li>
      ))}
    </ul>
  )
}
