import type { Metadata } from "next"
import Link from "next/link"
import { Building2, CircleCheck, Plus, ShieldCheck, Users } from "lucide-react"

import { PageHeader } from "@/components/common/page-header"
import { StatCard } from "@/components/dashboard/stat-card"
import { Button } from "@/components/ui/button"
import { requireSuperAdmin } from "@/server/auth/session"
import { getPlatformStats } from "@/server/services/platform-service"

export const metadata: Metadata = { title: "Platform dashboard" }

export default async function SuperAdminDashboardPage() {
  const actor = await requireSuperAdmin()
  const stats = await getPlatformStats(actor)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform overview"
        description="All gyms on FitTrack."
        actions={
          <Button nativeButton={false} render={<Link href="/super-admin/gyms/new" />}>
            <Plus data-icon="inline-start" />
            New gym
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gyms" value={String(stats.gyms)} icon={Building2} />
        <StatCard
          label="Active gyms"
          value={String(stats.activeGyms)}
          icon={CircleCheck}
          accentClassName="bg-chart-2/15 text-chart-2"
        />
        <StatCard
          label="Gym admins"
          value={String(stats.gymAdmins)}
          icon={ShieldCheck}
          accentClassName="bg-chart-4/15 text-chart-4"
        />
        <StatCard
          label="Members"
          value={String(stats.members)}
          icon={Users}
          accentClassName="bg-chart-3/15 text-chart-3"
        />
      </div>
    </div>
  )
}
