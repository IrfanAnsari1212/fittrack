import { cn } from "@/lib/utils"

export interface LinePoint {
  /** x-axis label, e.g. "Oct 5". */
  label: string
  value: number | null
}

interface LineChartProps {
  points: LinePoint[]
  /** Unit shown on the axis/tooltips, e.g. "kg". */
  unit: string
  /** Accessible description of the chart. */
  label: string
  className?: string
}

const W = 320
const H = 150
const PAD = { top: 12, right: 12, bottom: 24, left: 44 }

const compact = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 1 }))

/**
 * Small, dependency-free SVG line chart (same approach as `Sparkline`) with
 * a labelled y-range, point markers and per-point tooltips. Points with a
 * null value are skipped. Needs at least two values to draw a line.
 */
export function LineChart({ points, unit, label, className }: LineChartProps) {
  const known = points.map((p, i) => ({ ...p, i })).filter((p): p is LinePoint & { i: number; value: number } => p.value != null)
  if (known.length < 2) {
    return <p className="text-sm text-muted-foreground">Not enough data to chart yet.</p>
  }
  const values = known.map((p) => p.value)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min -= 1
    max += 1
  }
  const x = (i: number) => PAD.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * (W - PAD.left - PAD.right))
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom)
  const line = known.map((p) => `${x(p.i)},${y(p.value)}`).join(" ")
  const ticks = [min, (min + max) / 2, max]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className={cn("h-auto w-full text-primary", className)}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray="3 3" />
          <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">
            {compact(t)}
          </text>
        </g>
      ))}
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {known.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.value)} r="3" className="fill-current">
          <title>{`${p.label}: ${compact(p.value)} ${unit}`}</title>
        </circle>
      ))}
      <text x={PAD.left} y={H - 6} className="fill-muted-foreground text-[9px]">{points[0].label}</text>
      <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-muted-foreground text-[9px]">{points[points.length - 1].label}</text>
    </svg>
  )
}
