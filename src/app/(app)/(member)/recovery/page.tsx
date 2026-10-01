import type { Metadata } from "next"
import { Activity } from "lucide-react"

import { ModulePlaceholder } from "@/components/common/module-placeholder"
import { requireMember } from "@/server/auth/session"

export const metadata: Metadata = { title: "Recovery" }

export default async function RecoveryPage() {
  await requireMember()

  return (
    <ModulePlaceholder
      title="Recovery"
      description="Sleep, energy, soreness and notes."
      icon={Activity}
    />
  )
}
