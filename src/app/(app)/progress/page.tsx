import type { Metadata } from "next"
import { TrendingUp } from "lucide-react"

import { ModulePlaceholder } from "@/components/common/module-placeholder"

export const metadata: Metadata = { title: "Progress" }

export default function ProgressPage() {
  return (
    <ModulePlaceholder
      title="Progress"
      description="Body weight, measurements and photos."
      icon={TrendingUp}
    />
  )
}
