import type { WeightUnit } from "@/lib/workout/constants"

/** "6–8" or "10". */
export function formatReps(repsMin: number, repsMax: number | null): string {
  return repsMax && repsMax !== repsMin ? `${repsMin}–${repsMax}` : String(repsMin)
}

export function formatWeight(weight: number | null, unit: WeightUnit): string | null {
  if (weight == null) return null
  return `${Number.isInteger(weight) ? weight : Number(weight.toFixed(2))} ${unit}`
}

/** "4 × 6–8 @ 80 kg". */
export function formatTarget(t: {
  sets: number
  repsMin: number
  repsMax: number | null
  targetWeight: number | null
  weightUnit: WeightUnit
}): string {
  const weight = formatWeight(t.targetWeight, t.weightUnit)
  return `${t.sets} × ${formatReps(t.repsMin, t.repsMax)}${weight ? ` @ ${weight}` : ""}`
}

export function formatRest(seconds: number | null): string | null {
  if (seconds == null) return null
  if (seconds < 60) return `${seconds} sec rest`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s ? `${m} min ${s} sec rest` : `${m} min rest`
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/** "80 kg × 8"; bodyweight sets show "BW × 8". */
export function formatSet(weight: number | null, reps: number | null, unit: WeightUnit): string {
  const w = weight == null ? "BW" : (formatWeight(weight, unit) ?? "BW")
  return `${w} × ${reps ?? "—"}`
}

/** "Wednesday, October 1" for a "YYYY-MM-DD" calendar day (no timezone shift). */
export function formatCalendarDay(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`)
  )
}
