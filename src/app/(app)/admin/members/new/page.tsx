import type { Metadata } from "next"

import { MemberForm } from "@/components/admin/member-form"
import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { createMemberAction } from "@/server/actions/member-actions"
import { requireGymAdmin } from "@/server/auth/session"

export const metadata: Metadata = { title: "Add member" }

export default async function NewMemberPage() {
  const admin = await requireGymAdmin()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Add member" description={`Create an account at ${admin.gymName}.`} />
      <Card>
        <CardContent>
          <MemberForm action={createMemberAction} cancelHref="/admin/members" />
        </CardContent>
      </Card>
    </div>
  )
}
