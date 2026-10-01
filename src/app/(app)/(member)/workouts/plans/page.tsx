import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ClipboardList } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { WorkoutPlanFormDialog } from "@/components/workout/workout-plan-form-dialog"
import { formatDate } from "@/lib/format"
import { requireMember } from "@/server/auth/session"
import { selfTarget } from "@/server/services/nutrition/member-target"
import { listWorkoutPlanAssignments } from "@/server/services/workout/workout-assignment-service"
import { listWorkoutPlans } from "@/server/services/workout/workout-plan-service"

export const metadata: Metadata = { title: "My workout plans" }

/** The member's own (personal) plans. Gym plans are managed by the gym. */
export default async function MyWorkoutPlansPage() {
  const member = await requireMember()
  const [plans, assignments] = await Promise.all([listWorkoutPlans(member), listWorkoutPlanAssignments(selfTarget(member))])
  const activePlanId = assignments.find((a) => a.status === "ACTIVE")?.workoutPlanId

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/workouts" />}>
        <ArrowLeft data-icon="inline-start" />
        Workouts
      </Button>
      <PageHeader
        title="My workout plans"
        description="Plans you created or customized. Only you can change them."
        actions={<WorkoutPlanFormDialog />}
      />
      <Card>
        <CardContent>
          {plans.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No personal plans yet"
              description="Create your own plan, or use “Customize” on the plan your gym assigned you."
            />
          ) : (
            <ul className="divide-y">
              {plans.map((plan) => (
                <li key={plan.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/workouts/plans/${plan.id}`} className="font-medium underline-offset-4 hover:underline">
                      {plan.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {plan.dayCount} {plan.dayCount === 1 ? "workout day" : "workout days"} · updated {formatDate(plan.updatedAt)}
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
