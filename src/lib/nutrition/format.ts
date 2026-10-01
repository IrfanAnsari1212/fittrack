import { SERVING_UNITS, servingUnitLabels, type ServingUnit } from "@/lib/nutrition/units"

/** Display helpers only — no nutrition math here. */

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })

export function formatAmount(value: number) {
  return numberFormat.format(value)
}

/** "4 pieces", "150 g", "1 serving". */
export function formatQuantity(quantity: number, unit: ServingUnit) {
  const label = servingUnitLabels[unit]
  const word = quantity === 1 ? label.singular : label.plural
  const compact = unit === "g" || unit === "ml"
  return compact ? `${formatAmount(quantity)}${word}` : `${formatAmount(quantity)} ${word}`
}

/** "per 100g", "per 1 piece". */
export function formatServing(servingSize: number, unit: ServingUnit) {
  return `per ${formatQuantity(servingSize, unit)}`
}

export const unitOptions = SERVING_UNITS.map((unit) => ({
  value: unit,
  label: servingUnitLabels[unit].plural,
}))

/** Units a quantity of this food may be expressed in (matches the server rule). */
export function unitOptionsFor(servingUnit: ServingUnit) {
  const units: ServingUnit[] = servingUnit === "serving" ? ["serving"] : [servingUnit, "serving"]
  return units.map((unit) => ({ value: unit, label: servingUnitLabels[unit].plural }))
}
