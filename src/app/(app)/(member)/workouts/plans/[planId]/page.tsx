import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { UseMyWorkoutPlanDialog } from "@/components/workout/member/use-my-workout-plan-dialog"
import { WorkoutPlanArchiveButton } from "@/components/workout/workout-plan-archive-button"
import { WorkoutPlanBuilder } from "@/components/workout/workout-plan-builder"
import { WorkoutPlanFormDialog } from "@/components/workout/workout-plan-form-dialog"
import { requireMember } from "@/server/auth/session"
import { selfTarget } from "@/server/services/nutrition/member-target"
import { listExercises } from "@/server/services/workout/exercise-service"
import { listWorkoutPlanAssignments } from "@/server/services/workout/workout-assignment-service"
import { getWorkoutPlanDetail } from "@/server/services/workout/workout-plan-service"

export const metadata: Metadata = { title: "My workout plan" }

/** Edit one of MY personal plans. Gym plans and other members' plans → 404. */
export default async function MyWorkoutPlanPage({ params }: PageProps<"/workouts/plans/[planId]">) {
  const member = await requireMember()
  const { planId } = await params
  const plan = await getWorkoutPlanDetail(member, planId).catch(() => null)
  if (!plan) notFound()

  const [exercises, assignments] = await Promise.all([listExercises(member), listWorkoutPlanAssignments(selfTarget(member))])
  const isCurrent = assignments.some((a) => a.status === "ACTIVE" && a.workoutPlanId === plan.id)
  const editable = plan.status === "ACTIVE"

  return (
    <WorkoutPlanBuilder
      plan={plan}
      exercises={exercises.map(({ id, name, muscleGroup }) => ({ id, name, muscleGroup }))}
      editable={editable}
      backHref="/workouts/plans"
      backLabel="My workout plans"
      notice={
        !editable
          ? "This plan is archived. Restore it to edit or use it again."
          : plan.sourcePlanId
            ? "This is your own copy of a gym plan. Changes only affect you — the gym's plan stays the same for everyone else."
            : undefined
      }
      headerActions={
        <>
          {isCurrent ? <Badge>Current plan</Badge> : editable && <UseMyWorkoutPlanDialog planId={plan.id} />}
          {editable && <WorkoutPlanFormDialog plan={plan} />}
          <WorkoutPlanArchiveButton planId={plan.id} archived={!editable} />
        </>
      }
    />
  )
}
