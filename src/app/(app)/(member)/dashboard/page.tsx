import type { Metadata } from "next"

import { PageHeader } from "@/components/common/page-header"
import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import { getDashboardData } from "@/lib/mock-data"
import { requireMember } from "@/server/auth/session"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage() {
  const member = await requireMember()
  // Fitness data is still mock data until the tracking modules are built.
  const data = await getDashboardData()
  const firstName = member.name.split(" ")[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={`Here's your summary for today at ${member.gymName}.`}
      />
      <DashboardOverview data={data} />
    </div>
  )
}
