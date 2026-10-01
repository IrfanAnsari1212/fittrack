import Link from "next/link"

import { StatusBadge } from "@/components/admin/status-badge"
import { AssignPlanForm } from "@/components/nutrition/admin/assign-plan-form"
import { EndAssignmentButtons } from "@/components/nutrition/admin/end-assignment-buttons"
import { GoalForm } from "@/components/nutrition/goal-form"
import { GoalHistory } from "@/components/nutrition/goal-history"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { setMemberGoalAction } from "@/server/actions/member-nutrition-admin-actions"
import { listDietPlanAssignments } from "@/server/services/nutrition/assignment-service"
import { listDietPlans } from "@/server/services/nutrition/diet-plan-service"
import { listNutritionGoals } from "@/server/services/nutrition/goal-service"
import { gymMemberTarget } from "@/server/services/nutrition/member-target"
import type { GymAdminUser } from "@/types/auth"

/**
 * Gym Admin view of one member's nutrition: plan assignment and goals.
 * `gymMemberTarget` re-verifies the member belongs to the admin's gym.
 */
export async function MemberNutritionSection({ admin, memberId }: { admin: GymAdminUser; memberId: string }) {
  const target = await gymMemberTarget(admin, memberId)
  const [assignments, goals, plans] = await Promise.all([
    listDietPlanAssignments(target),
    listNutritionGoals(target),
    listDietPlans(admin, { status: "ACTIVE" }),
  ])
  const active = assignments.find((a) => a.status === "ACTIVE")
  const latestGoal = goals[0] ?? null

  return (
    <section aria-labelledby="nutrition-heading" className="space-y-4">
      <h2 id="nutrition-heading" className="text-lg font-semibold">Nutrition</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Diet plan</CardTitle>
            <CardDescription>One active plan per member.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {active ? (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/admin/diet-plans/${active.dietPlanId}`} className="font-medium underline-offset-4 hover:underline">
                    {active.dietPlanName}
                  </Link>
                  <span className="flex items-center gap-2">
                    {active.dietPlanKind === "PERSONAL" && <Badge variant="outline">Member&apos;s own plan</Badge>}
                    <StatusBadge status={active.status} />
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  From {active.startDate}
                  {active.endDate ? ` to ${active.endDate}` : " (no end date)"}
                </p>
                <EndAssignmentButtons memberId={memberId} assignmentId={active.id} planName={active.dietPlanName} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active diet plan.</p>
            )}
            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{active ? "Assign a different plan" : "Assign a plan"}</h3>
              <AssignPlanForm memberId={memberId} plans={plans.map((p) => ({ id: p.id, name: p.name }))} />
            </div>
            {assignments.some((a) => a.status !== "ACTIVE") && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">History</h3>
                  <ul className="divide-y rounded-lg border text-sm">
                    {assignments
                      .filter((a) => a.status !== "ACTIVE")
                      .map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <span>
                            {a.dietPlanName}
                            {a.dietPlanKind === "PERSONAL" && <span className="text-xs text-muted-foreground"> (member&apos;s own)</span>}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {a.startDate} → {a.endDate ?? "—"}
                            <StatusBadge status={a.status} />
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nutrition goal</CardTitle>
            <CardDescription>Daily targets. The member can also set their own.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <GoalHistory goals={goals} />
            <Separator />
            <GoalForm action={setMemberGoalAction.bind(null, memberId)} goal={latestGoal} />
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
