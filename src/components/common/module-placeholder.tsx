import type { LucideIcon } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"

/** Temporary page body for sections that will be built in later modules. */
export function ModulePlaceholder({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: LucideIcon
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title="Coming soon"
        description={`The ${title.toLowerCase()} module hasn't been built yet.`}
        className="py-16"
      />
    </div>
  )
}
