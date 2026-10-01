import type { Metadata } from "next"
import Link from "next/link"
import { Salad } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"
import { DietPlanFormDialog } from "@/components/nutrition/admin/diet-plan-form-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { requireGymAdmin } from "@/server/auth/session"
import { listDietPlans } from "@/server/services/nutrition/diet-plan-service"

export const metadata: Metadata = { title: "Diet plans" }

export default async function DietPlansPage({ searchParams }: PageProps<"/admin/diet-plans">) {
  const admin = await requireGymAdmin()
  const { status: statusParam } = await searchParams
  const status = statusParam === "archived" ? "ARCHIVED" : "ACTIVE"
  const plans = await listDietPlans(admin, { status })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diet plans"
        description="Build meal plans and assign them to your members."
        actions={<DietPlanFormDialog />}
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex gap-1 text-sm" role="group" aria-label="Status filter">
            {[
              { label: "Active", href: "/admin/diet-plans", on: status === "ACTIVE" },
              { label: "Archived", href: "/admin/diet-plans?status=archived", on: status === "ARCHIVED" },
            ].map((f) => (
              <Link
                key={f.label}
                href={f.href}
                aria-current={f.on ? "true" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 transition-colors",
                  f.on ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
          {plans.length === 0 ? (
            <EmptyState
              icon={Salad}
              title={status === "ACTIVE" ? "No diet plans yet" : "No archived plans"}
              description={status === "ACTIVE" ? "Create a plan, then add meals and foods." : undefined}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Meals</TableHead>
                  <TableHead className="hidden sm:table-cell">Updated</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <Link href={`/admin/diet-plans/${plan.id}`} className="font-medium underline-offset-4 hover:underline">
                        {plan.name}
                      </Link>
                      {plan.description && (
                        <p className="line-clamp-1 text-xs text-muted-foreground">{plan.description}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{plan.mealCount}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDate(plan.updatedAt)}</TableCell>
                    <TableCell><StatusBadge status={plan.status} /></TableCell>
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
