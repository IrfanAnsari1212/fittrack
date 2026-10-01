import type { Metadata } from "next"
import { Dumbbell } from "lucide-react"

import { ModulePlaceholder } from "@/components/common/module-placeholder"
import { requireMember } from "@/server/auth/session"

export const metadata: Metadata = { title: "Workouts" }

export default async function WorkoutsPage() {
  await requireMember()

  return (
    <ModulePlaceholder
      title="Workouts"
      description="Workout plans, exercises and history."
      icon={Dumbbell}
    />
  )
}
