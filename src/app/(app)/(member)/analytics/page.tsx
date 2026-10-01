import type { Metadata } from "next"
import { BarChart3 } from "lucide-react"

import { ModulePlaceholder } from "@/components/common/module-placeholder"
import { requireMember } from "@/server/auth/session"

export const metadata: Metadata = { title: "Analytics" }

export default async function AnalyticsPage() {
  await requireMember()

  return (
    <ModulePlaceholder
      title="Analytics"
      description="Charts and trends across all your data."
      icon={BarChart3}
    />
  )
}
