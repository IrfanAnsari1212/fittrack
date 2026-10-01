import type { Metadata } from "next"
import { Utensils } from "lucide-react"

import { ModulePlaceholder } from "@/components/common/module-placeholder"
import { requireMember } from "@/server/auth/session"

export const metadata: Metadata = { title: "Nutrition" }

export default async function NutritionPage() {
  await requireMember()

  return (
    <ModulePlaceholder
      title="Nutrition"
      description="Meals, calories and protein targets."
      icon={Utensils}
    />
  )
}
