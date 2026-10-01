import type { Metadata } from "next"

import { PageHeader } from "@/components/common/page-header"
import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import { getDashboardData } from "@/lib/mock-data"
import { placeholderUser } from "@/lib/site-config"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage() {
  const data = await getDashboardData()
  const firstName = placeholderUser.name.split(" ")[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's your summary for today."
      />
      <DashboardOverview data={data} />
    </div>
  )
}
