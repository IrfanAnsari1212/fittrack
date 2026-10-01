import type { NutritionTotals } from "@/lib/nutrition/calculations"
import { formatAmount } from "@/lib/nutrition/format"
import { cn } from "@/lib/utils"

/** Compact "520 kcal · 38 g protein · 12 g carbs" line. Display only. */
export function NutritionTotalsLine({
  totals,
  className,
  showOptional = true,
}: {
  totals: NutritionTotals
  className?: string
  showOptional?: boolean
}) {
  const parts = [`${formatAmount(totals.calories)} kcal`, `${formatAmount(totals.protein)} g protein`]
  if (showOptional && totals.carbs != null) parts.push(`${formatAmount(totals.carbs)} g carbs`)
  if (showOptional && totals.fat != null) parts.push(`${formatAmount(totals.fat)} g fat`)
  return <p className={cn("text-xs text-muted-foreground tabular-nums", className)}>{parts.join(" · ")}</p>
}

/** Bigger 4-up totals block (plan totals, day totals). */
export function NutritionTotalsGrid({ totals, label }: { totals: NutritionTotals; label?: string }) {
  const items = [
    { name: "Calories", value: formatAmount(totals.calories), unit: "kcal" },
    { name: "Protein", value: formatAmount(totals.protein), unit: "g" },
    { name: "Carbs", value: totals.carbs == null ? "—" : formatAmount(totals.carbs), unit: totals.carbs == null ? "" : "g" },
    { name: "Fat", value: totals.fat == null ? "—" : formatAmount(totals.fat), unit: totals.fat == null ? "" : "g" },
  ]
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.name} className="rounded-lg bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{item.name}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {item.value}
            {item.unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{item.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
