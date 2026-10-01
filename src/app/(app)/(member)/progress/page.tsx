import type { Metadata } from "next"
import { TrendingUp } from "lucide-react"

import { ModulePlaceholder } from "@/components/common/module-placeholder"
import { requireMember } from "@/server/auth/session"

export const metadata: Metadata = { title: "Progress" }

export default async function ProgressPage() {
  await requireMember()

  return (
    <ModulePlaceholder
      title="Progress"
      description="Body weight, measurements and photos."
      icon={TrendingUp}
    />
  )
}
