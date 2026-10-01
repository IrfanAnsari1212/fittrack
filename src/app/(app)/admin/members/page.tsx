import type { Metadata } from "next"
import Link from "next/link"
import { UserPlus } from "lucide-react"

import { MemberSearch } from "@/components/admin/member-search"
import { MembersTable } from "@/components/admin/members-table"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireGymAdmin } from "@/server/auth/session"
import { listMembers } from "@/server/services/member-service"

export const metadata: Metadata = { title: "Members" }

export default async function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  const admin = await requireGymAdmin()
  const { q } = await searchParams
  const query = typeof q === "string" ? q : undefined
  // Scoped to the admin's gym inside the service.
  const members = await listMembers(admin, { query })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description={`Everyone with an account at ${admin.gymName}.`}
        actions={
          <Button nativeButton={false} render={<Link href="/admin/members/new" />}>
            <UserPlus data-icon="inline-start" />
            Add member
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <MemberSearch defaultValue={query} />
            <p className="text-sm text-muted-foreground">
              {members.length} {members.length === 1 ? "member" : "members"}
            </p>
          </div>
          <MembersTable members={members} query={query} />
        </CardContent>
      </Card>
    </div>
  )
}
