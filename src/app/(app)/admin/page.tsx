import type { Metadata } from "next"
import Link from "next/link"
import { CreditCard, UserCheck, UserPlus, Users, UserX } from "lucide-react"

import { PageHeader } from "@/components/common/page-header"
import { StatCard } from "@/components/dashboard/stat-card"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/format"
import { requireGymAdmin } from "@/server/auth/session"
import { getOwnGym } from "@/server/services/gym-service"
import { getMemberStats } from "@/server/services/member-service"

export const metadata: Metadata = { title: "Gym dashboard" }

export default async function GymAdminDashboardPage() {
  const admin = await requireGymAdmin()
  const [gym, stats] = await Promise.all([getOwnGym(admin), getMemberStats(admin)])

  return (
    <div className="space-y-6">
      <PageHeader
        title={gym.name}
        description="Overview of your gym."
        actions={
          <Button nativeButton={false} render={<Link href="/admin/members/new" />}>
            <UserPlus data-icon="inline-start" />
            Add member
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total members" value={String(stats.totalMembers)} icon={Users} />
        <StatCard
          label="Active members"
          value={String(stats.activeMembers)}
          icon={UserCheck}
          accentClassName="bg-chart-2/15 text-chart-2"
        />
        <StatCard
          label="Disabled members"
          value={String(stats.disabledMembers)}
          icon={UserX}
          accentClassName="bg-chart-5/15 text-chart-5"
        />
        <StatCard
          label="Plan"
          value={gym.plan}
          icon={CreditCard}
          accentClassName="bg-chart-4/15 text-chart-4"
          helper={`Since ${formatDate(gym.createdAt)}`}
        />
      </div>
    </div>
  )
}
