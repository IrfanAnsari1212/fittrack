import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Salad } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"
import { DietPlanFormDialog } from "@/components/nutrition/admin/diet-plan-form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatDate } from "@/lib/format"
import { requireMember } from "@/server/auth/session"
import { listDietPlanAssignments } from "@/server/services/nutrition/assignment-service"
import { listDietPlans } from "@/server/services/nutrition/diet-plan-service"
import { selfTarget } from "@/server/services/nutrition/member-target"

export const metadata: Metadata = { title: "My diet plans" }

/** The member's own (personal) plans. Gym plans are managed by the gym. */
export default async function MyDietPlansPage() {
  const member = await requireMember()
  const [plans, assignments] = await Promise.all([
    listDietPlans(member),
    listDietPlanAssignments(selfTarget(member)),
  ])
  const activePlanId = assignments.find((a) => a.status === "ACTIVE")?.dietPlanId

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/nutrition" />}>
        <ArrowLeft data-icon="inline-start" />
        Nutrition
      </Button>
      <PageHeader
        title="My diet plans"
        description="Plans you created or customized. Only you can change them."
        actions={<DietPlanFormDialog />}
      />
      <Card>
        <CardContent>
          {plans.length === 0 ? (
            <EmptyState
              icon={Salad}
              title="No personal plans yet"
              description="Create your own plan, or use “Customize” on the plan your gym assigned you."
            />
          ) : (
            <ul className="divide-y">
              {plans.map((plan) => (
                <li key={plan.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/nutrition/plans/${plan.id}`} className="font-medium underline-offset-4 hover:underline">
                      {plan.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {plan.mealCount} {plan.mealCount === 1 ? "meal" : "meals"} · updated {formatDate(plan.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {plan.id === activePlanId && <Badge>Current plan</Badge>}
                    <StatusBadge status={plan.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
