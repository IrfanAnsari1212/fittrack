import type { Metadata } from "next"
import { Activity } from "lucide-react"

import { ModulePlaceholder } from "@/components/common/module-placeholder"

export const metadata: Metadata = { title: "Recovery" }

export default function RecoveryPage() {
  return (
    <ModulePlaceholder
      title="Recovery"
      description="Sleep, energy, soreness and notes."
      icon={Activity}
    />
  )
}
