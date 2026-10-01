import type { Metadata } from "next"
import Link from "next/link"
import { Building2, Plus } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import { requireSuperAdmin } from "@/server/auth/session"
import { listGyms } from "@/server/services/platform-service"

export const metadata: Metadata = { title: "Gyms" }

export default async function GymsPage() {
  const actor = await requireSuperAdmin()
  const gyms = await listGyms(actor)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gyms"
        description="Every tenant on the platform."
        actions={
          <Button nativeButton={false} render={<Link href="/super-admin/gyms/new" />}>
            <Plus data-icon="inline-start" />
            New gym
          </Button>
        }
      />
      <Card>
        <CardContent>
          {gyms.length === 0 ? (
            <EmptyState icon={Building2} title="No gyms yet" description="Create the first gym to get started." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gym</TableHead>
                  <TableHead className="hidden md:table-cell">Owner</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="hidden sm:table-cell">Plan</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gyms.map((gym) => (
                  <TableRow key={gym.id}>
                    <TableCell>
                      <p className="font-medium">{gym.name}</p>
                      <p className="text-xs text-muted-foreground">Created {formatDate(gym.createdAt)}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p>{gym.ownerName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{gym.ownerEmail}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{gym.memberCount}</TableCell>
                    <TableCell className="hidden sm:table-cell">{gym.plan}</TableCell>
                    <TableCell>
                      <StatusBadge status={gym.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
