import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { WorkoutPlanArchiveButton } from "@/components/workout/workout-plan-archive-button"
import { WorkoutPlanBuilder } from "@/components/workout/workout-plan-builder"
import { WorkoutPlanFormDialog } from "@/components/workout/workout-plan-form-dialog"
import { requireGymAdmin } from "@/server/auth/session"
import { listExercises } from "@/server/services/workout/exercise-service"
import { getWorkoutPlanDetail } from "@/server/services/workout/workout-plan-service"

export const metadata: Metadata = { title: "Workout plan" }

export default async function WorkoutPlanBuilderPage({ params }: PageProps<"/admin/workouts/[planId]">) {
  const admin = await requireGymAdmin()
  const { planId } = await params
  // Any plan in the admin's gym (gym plans, and members' personal plans
  // read-only); another gym's plan or an invalid id → 404.
  const plan = await getWorkoutPlanDetail(admin, planId).catch(() => null)
  if (!plan) notFound()

  const exercises = await listExercises(admin)
  const personal = plan.ownerUserId !== null
  const editable = !personal && plan.status === "ACTIVE"

  return (
    <WorkoutPlanBuilder
      plan={plan}
      exercises={exercises.map(({ id, name, muscleGroup }) => ({ id, name, muscleGroup }))}
      editable={editable}
      backHref="/admin/workouts"
      backLabel="Workout plans"
      notice={
        personal
          ? "This is a member's personal plan. Only the member can change it; you can view it, or end their assignment from their member page."
          : plan.status !== "ACTIVE"
            ? "This plan is archived: it's read-only and can't be newly assigned."
            : undefined
      }
      headerActions={
        personal ? undefined : (
          <>
            {editable && <WorkoutPlanFormDialog plan={plan} />}
            <WorkoutPlanArchiveButton planId={plan.id} archived={plan.status !== "ACTIVE"} />
          </>
        )
      }
    />
  )
}
