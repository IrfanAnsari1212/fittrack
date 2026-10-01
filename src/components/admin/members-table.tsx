import Link from "next/link"
import { Users } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { EmptyState } from "@/components/common/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import type { MemberSummary } from "@/types/admin"

export function MembersTable({
  members,
  query,
}: {
  members: MemberSummary[]
  query?: string
}) {
  if (members.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={query ? "No matching members" : "No members yet"}
        description={
          query ? `Nothing matches “${query}”.` : "Add your first member to get started."
        }
      />
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="hidden md:table-cell">Email</TableHead>
          <TableHead className="hidden sm:table-cell">Joined</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell>
              <Link
                href={`/admin/members/${member.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {member.name}
              </Link>
              <p className="text-xs text-muted-foreground md:hidden">{member.email}</p>
            </TableCell>
            <TableCell className="hidden text-muted-foreground md:table-cell">
              {member.email}
            </TableCell>
            <TableCell className="hidden text-muted-foreground sm:table-cell">
              {formatDate(member.createdAt)}
            </TableCell>
            <TableCell>
              <StatusBadge status={member.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
