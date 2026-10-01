import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { MemberForm } from "@/components/admin/member-form"
import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { updateMemberAction } from "@/server/actions/member-actions"
import { requireGymAdmin } from "@/server/auth/session"
import { getMember } from "@/server/services/member-service"

export const metadata: Metadata = { title: "Edit member" }

export default async function EditMemberPage({
  params,
}: PageProps<"/admin/members/[memberId]/edit">) {
  const admin = await requireGymAdmin()
  const { memberId } = await params
  const member = await getMember(admin, memberId)
  if (!member) notFound()

  // The action re-checks ownership server-side; binding the id is not trust.
  const action = updateMemberAction.bind(null, member.id)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={`Edit ${member.name}`} />
      <Card>
        <CardContent>
          <MemberForm action={action} member={member} cancelHref={`/admin/members/${member.id}`} />
        </CardContent>
      </Card>
    </div>
  )
}
