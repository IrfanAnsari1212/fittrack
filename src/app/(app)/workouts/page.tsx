import type { Metadata } from "next"
import { Dumbbell } from "lucide-react"

import { ModulePlaceholder } from "@/components/common/module-placeholder"

export const metadata: Metadata = { title: "Workouts" }

export default function WorkoutsPage() {
  return (
    <ModulePlaceholder
      title="Workouts"
      description="Workout plans, exercises and history."
      icon={Dumbbell}
    />
  )
}
