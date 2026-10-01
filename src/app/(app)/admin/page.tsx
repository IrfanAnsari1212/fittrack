import type { Metadata } from "next"
import { ShieldCheck } from "lucide-react"

import { ModulePlaceholder } from "@/components/common/module-placeholder"

export const metadata: Metadata = { title: "Admin Dashboard" }

export default function AdminPage() {
  return (
    <ModulePlaceholder
      title="Admin Dashboard"
      description="Platform administration and user management."
      icon={ShieldCheck}
    />
  )
}
