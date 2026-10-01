const numberFormatter = new Intl.NumberFormat("en-US")

export function formatNumber(value: number) {
  return numberFormatter.format(Math.round(value))
}

/** Percentage of `value` against `total`, clamped to 0–100. */
export function percentOf(value: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)))
}

/** "13:30" -> "1:30 PM" */
export function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")} ${period}`
}

export function formatSignedDelta(value: number, fractionDigits = 1) {
  const fixed = Math.abs(value).toFixed(fractionDigits)
  if (value > 0) return `+${fixed}`
  if (value < 0) return `−${fixed}`
  return fixed
}
