import type { Metadata } from "next"

import { StatusBadge } from "@/components/admin/status-badge"
import { PageHeader } from "@/components/common/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { roleLabels } from "@/lib/auth/roles"
import { formatDate } from "@/lib/format"
import { requireSuperAdmin } from "@/server/auth/session"
import { listAllUsers } from "@/server/services/platform-service"

export const metadata: Metadata = { title: "Users" }

export default async function PlatformUsersPage() {
  const actor = await requireSuperAdmin()
  const users = await listAllUsers(actor)

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="All accounts across every gym (read-only)." />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Gym</TableHead>
                <TableHead className="hidden sm:table-cell">Joined</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{roleLabels[user.role]}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{user.gymName ?? "—"}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
