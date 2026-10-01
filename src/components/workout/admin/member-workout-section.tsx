import Link from "next/link"

import { StatusBadge } from "@/components/admin/status-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { AssignWorkoutPlanForm } from "@/components/workout/admin/assign-workout-plan-form"
import { EndWorkoutAssignmentButtons } from "@/components/workout/admin/end-workout-assignment-buttons"
import { WorkoutHistoryList } from "@/components/workout/workout-history-list"
import { gymMemberTarget } from "@/server/services/nutrition/member-target"
import { listWorkoutPlanAssignments } from "@/server/services/workout/workout-assignment-service"
import { listWorkoutPlans } from "@/server/services/workout/workout-plan-service"
import { listWorkoutHistory } from "@/server/services/workout/workout-session-service"
import type { GymAdminUser } from "@/types/auth"

/**
 * Gym Admin view of one member's workouts: plan assignment and recent logged
 * workouts (read-only). `gymMemberTarget` re-verifies the member belongs to
 * the admin's gym.
 */
export async function MemberWorkoutSection({ admin, memberId }: { admin: GymAdminUser; memberId: string }) {
  const target = await gymMemberTarget(admin, memberId)
  const [assignments, plans, history] = await Promise.all([
    listWorkoutPlanAssignments(target),
    listWorkoutPlans(admin, { status: "ACTIVE" }),
    listWorkoutHistory(target, { limit: 5 }),
  ])
  const active = assignments.find((a) => a.status === "ACTIVE")
  const past = assignments.filter((a) => a.status !== "ACTIVE")

  return (
    <section aria-labelledby="workouts-heading" className="space-y-4">
      <h2 id="workouts-heading" className="text-lg font-semibold">Workouts</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workout plan</CardTitle>
            <CardDescription>One active plan per member.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {active ? (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/admin/workouts/${active.workoutPlanId}`} className="font-medium underline-offset-4 hover:underline">
                    {active.workoutPlanName}
                  </Link>
                  <span className="flex items-center gap-2">
                    {active.workoutPlanKind === "PERSONAL" && <Badge variant="outline">Member&apos;s own plan</Badge>}
                    <StatusBadge status={active.status} />
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  From {active.startDate}
                  {active.endDate ? ` to ${active.endDate}` : " (no end date)"}
                </p>
                <EndWorkoutAssignmentButtons memberId={memberId} assignmentId={active.id} planName={active.workoutPlanName} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active workout plan.</p>
            )}
            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{active ? "Assign a different plan" : "Assign a plan"}</h3>
              <AssignWorkoutPlanForm memberId={memberId} plans={plans.map((p) => ({ id: p.id, name: p.name }))} />
            </div>
            {past.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">History</h3>
                  <ul className="divide-y rounded-lg border text-sm">
                    {past.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span>
                          {a.workoutPlanName}
                          {a.workoutPlanKind === "PERSONAL" && <span className="text-xs text-muted-foreground"> (member&apos;s own)</span>}
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
            <CardTitle>Recent workouts</CardTitle>
            <CardDescription>What the member actually did (read-only).</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workouts logged yet.</p>
            ) : (
              <WorkoutHistoryList sessions={history} />
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
