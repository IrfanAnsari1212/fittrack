import type { Metadata } from "next"
import { BarChart3 } from "lucide-react"

import { ModulePlaceholder } from "@/components/common/module-placeholder"

export const metadata: Metadata = { title: "Analytics" }

export default function AnalyticsPage() {
  return (
    <ModulePlaceholder
      title="Analytics"
      description="Charts and trends across all your data."
      icon={BarChart3}
    />
  )
}
