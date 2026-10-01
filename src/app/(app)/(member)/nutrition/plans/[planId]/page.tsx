import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DietPlanFormDialog } from "@/components/nutrition/admin/diet-plan-form-dialog"
import { PlanArchiveButton } from "@/components/nutrition/admin/plan-archive-button"
import { UseMyPlanDialog } from "@/components/nutrition/member/use-my-plan-dialog"
import { PlanBuilder } from "@/components/nutrition/plan-builder"
import { Badge } from "@/components/ui/badge"
import { requireMember } from "@/server/auth/session"
import { listDietPlanAssignments } from "@/server/services/nutrition/assignment-service"
import { getDietPlanDetail } from "@/server/services/nutrition/diet-plan-service"
import { listFoods } from "@/server/services/nutrition/food-service"
import { selfTarget } from "@/server/services/nutrition/member-target"

export const metadata: Metadata = { title: "My diet plan" }

/** Edit one of MY personal plans. Gym plans and other members' plans → 404. */
export default async function MyDietPlanPage({ params }: PageProps<"/nutrition/plans/[planId]">) {
  const member = await requireMember()
  const { planId } = await params
  const plan = await getDietPlanDetail(member, planId).catch(() => null)
  if (!plan) notFound()

  const [foods, assignments] = await Promise.all([listFoods(member), listDietPlanAssignments(selfTarget(member))])
  const isCurrent = assignments.some((a) => a.status === "ACTIVE" && a.dietPlanId === plan.id)
  const editable = plan.status === "ACTIVE"

  return (
    <PlanBuilder
      plan={plan}
      foods={foods}
      editable={editable}
      backHref="/nutrition/plans"
      backLabel="My diet plans"
      notice={
        !editable
          ? "This plan is archived. Restore it to edit or use it again."
          : plan.sourcePlanId
            ? "This is your own copy of a gym plan. Changes only affect you — the gym's plan stays the same for everyone else."
            : undefined
      }
      headerActions={
        <>
          {isCurrent ? <Badge>Current plan</Badge> : editable && <UseMyPlanDialog planId={plan.id} />}
          {editable && <DietPlanFormDialog plan={plan} />}
          <PlanArchiveButton planId={plan.id} archived={!editable} />
        </>
      }
    />
  )
}
