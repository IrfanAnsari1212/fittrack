import type { Metadata } from "next"
import { User } from "lucide-react"

import { ModulePlaceholder } from "@/components/common/module-placeholder"

export const metadata: Metadata = { title: "Profile" }

export default function ProfilePage() {
  return (
    <ModulePlaceholder
      title="Profile"
      description="Your personal details and goals."
      icon={User}
    />
  )
}
