import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { ProgressBody } from "@/components/workout/performance/progress-body"
import { requireGymAdmin } from "@/server/auth/session"
import { getMember } from "@/server/services/member-service"
import { gymMemberTarget } from "@/server/services/nutrition/member-target"

export const metadata: Metadata = { title: "Member progress" }

/** Read-only view of one member's workout progress. Another gym's member → 404. */
export default async function MemberProgressPage({ params, searchParams }: PageProps<"/admin/members/[memberId]/progress">) {
  const admin = await requireGymAdmin()
  const { memberId } = await params
  const member = await getMember(admin, memberId)
  if (!member) notFound()
  const target = await gymMemberTarget(admin, member.id)
  const query = await searchParams

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/admin/members/${member.id}`} />}>
        <ArrowLeft data-icon="inline-start" />
        {member.name}
      </Button>
      <PageHeader title={`${member.name}'s progress`} description="Read-only. Based on the member's completed workouts." />
      <ProgressBody target={target} searchParams={query} basePath={`/admin/members/${member.id}/progress`} canApply={false} />
    </div>
  )
}
