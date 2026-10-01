import { Beef, Flame, Target, TrendingDown } from "lucide-react"

import { StatCard } from "@/components/dashboard/stat-card"
import { formatNumber, percentOf } from "@/lib/format"
import type { DailyNutritionSummary } from "@/types/dashboard"

/** Today's calories/protein plus remaining amounts. */
export function NutritionStats({ data }: { data: DailyNutritionSummary }) {
  const { calories, protein } = data
  const remainingCalories = Math.max(0, calories.target - calories.consumed)
  const remainingProtein = Math.max(0, protein.target - protein.consumed)

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Calories today"
        value={formatNumber(calories.consumed)}
        unit="kcal"
        icon={Flame}
        progress={percentOf(calories.consumed, calories.target)}
        helper={`${percentOf(calories.consumed, calories.target)}% of ${formatNumber(calories.target)} kcal goal`}
      />
      <StatCard
        label="Protein today"
        value={formatNumber(protein.consumed)}
        unit="g"
        icon={Beef}
        accentClassName="bg-chart-2/15 text-chart-2"
        progress={percentOf(protein.consumed, protein.target)}
        helper={`${percentOf(protein.consumed, protein.target)}% of ${protein.target} g goal`}
      />
      <StatCard
        label="Calories remaining"
        value={formatNumber(remainingCalories)}
        unit="kcal"
        icon={TrendingDown}
        accentClassName="bg-chart-3/15 text-chart-3"
        helper={
          remainingCalories === 0 ? "Daily goal reached" : "Left for today"
        }
      />
      <StatCard
        label="Protein remaining"
        value={formatNumber(remainingProtein)}
        unit="g"
        icon={Target}
        accentClassName="bg-chart-4/15 text-chart-4"
        helper={remainingProtein === 0 ? "Daily goal reached" : "Left for today"}
      />
    </div>
  )
}
