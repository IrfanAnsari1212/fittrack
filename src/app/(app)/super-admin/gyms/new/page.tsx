import type { Metadata } from "next"

import { PageHeader } from "@/components/common/page-header"
import { CreateGymForm } from "@/components/super-admin/create-gym-form"
import { Card, CardContent } from "@/components/ui/card"
import { requireSuperAdmin } from "@/server/auth/session"

export const metadata: Metadata = { title: "New gym" }

export default async function NewGymPage() {
  await requireSuperAdmin()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="New gym"
        description="Creates the gym and its admin account together."
      />
      <Card>
        <CardContent>
          <CreateGymForm />
        </CardContent>
      </Card>
    </div>
  )
}
