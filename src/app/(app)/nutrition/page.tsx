import type { Metadata } from "next"
import { Utensils } from "lucide-react"

import { ModulePlaceholder } from "@/components/common/module-placeholder"

export const metadata: Metadata = { title: "Nutrition" }

export default function NutritionPage() {
  return (
    <ModulePlaceholder
      title="Nutrition"
      description="Meals, calories and protein targets."
      icon={Utensils}
    />
  )
}
