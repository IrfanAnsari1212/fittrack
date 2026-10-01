import { cn } from "@/lib/utils"

interface SparklineProps {
  values: number[]
  className?: string
  /** Accessible description of the trend. */
  label: string
}

/**
 * Dependency-free SVG trend line. A full charting library can be introduced
 * with the Analytics module; this covers small inline trends.
 */
export function Sparkline({ values, className, label }: SparklineProps) {
  if (values.length < 2) return null

  const width = 100
  const height = 32
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return [x, y] as const
  })
  const line = points.map(([x, y]) => `${x},${y}`).join(" ")
  const area = `0,${height} ${line} ${width},${height}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={cn("h-12 w-full text-primary", className)}
    >
      <polygon points={area} className="fill-current opacity-10" />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
