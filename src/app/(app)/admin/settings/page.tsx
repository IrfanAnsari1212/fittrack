import type { Metadata } from "next"

import { GymSettingsForm } from "@/components/admin/gym-settings-form"
import { StatusBadge } from "@/components/admin/status-badge"
import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/format"
import { requireGymAdmin } from "@/server/auth/session"
import { getOwnGym } from "@/server/services/gym-service"

export const metadata: Metadata = { title: "Gym settings" }

export default async function GymSettingsPage() {
  const admin = await requireGymAdmin()
  const gym = await getOwnGym(admin)

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Gym-level settings." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>Shown to your members across FitTrack.</CardDescription>
          </CardHeader>
          <CardContent>
            <GymSettingsForm gymName={gym.name} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>Billing is managed by FitTrack.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Gym status</dt>
                <dd><StatusBadge status={gym.status} /></dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-medium">{gym.plan}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Subscription</dt>
                <dd className="font-medium">{gym.subscriptionStatus}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-medium">{formatDate(gym.createdAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
