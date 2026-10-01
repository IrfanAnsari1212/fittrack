import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

import { MemberStatusToggle } from "@/components/admin/member-status-toggle"
import { StatusBadge } from "@/components/admin/status-badge"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/format"
import { requireGymAdmin } from "@/server/auth/session"
import { getMember } from "@/server/services/member-service"

export const metadata: Metadata = { title: "Member" }

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  )
}

export default async function MemberDetailPage({
  params,
}: PageProps<"/admin/members/[memberId]">) {
  const admin = await requireGymAdmin()
  const { memberId } = await params
  // Query is `_id = memberId AND gymId = admin.gymId`: a member of another
  // gym is indistinguishable from a non-existent one → 404.
  const member = await getMember(admin, memberId)
  if (!member) notFound()

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={<Link href="/admin/members" />}
      >
        <ArrowLeft data-icon="inline-start" />
        Members
      </Button>
      <PageHeader
        title={member.name}
        description={member.email}
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/admin/members/${member.id}/edit`} />}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
            <MemberStatusToggle
              memberId={member.id}
              memberName={member.name}
              status={member.status}
            />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2">
              <Detail label="Name">{member.name}</Detail>
              <Detail label="Email">{member.email}</Detail>
              <Detail label="Phone">{member.phone ?? "—"}</Detail>
              <Detail label="Date of birth">{formatDate(member.dateOfBirth)}</Detail>
              <div className="sm:col-span-2">
                <Detail label="Notes">{member.notes ?? "—"}</Detail>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Membership</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-5">
              <Detail label="Status">
                <StatusBadge status={member.status} />
              </Detail>
              <Detail label="Gym">{member.gymName}</Detail>
              <Detail label="Member since">{formatDate(member.createdAt)}</Detail>
              <Detail label="Last updated">{formatDate(member.updatedAt)}</Detail>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
