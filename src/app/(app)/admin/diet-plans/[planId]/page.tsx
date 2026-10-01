import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DietPlanFormDialog } from "@/components/nutrition/admin/diet-plan-form-dialog"
import { PlanArchiveButton } from "@/components/nutrition/admin/plan-archive-button"
import { PlanBuilder } from "@/components/nutrition/plan-builder"
import { requireGymAdmin } from "@/server/auth/session"
import { getDietPlanDetail } from "@/server/services/nutrition/diet-plan-service"
import { listFoods } from "@/server/services/nutrition/food-service"

export const metadata: Metadata = { title: "Diet plan" }

export default async function DietPlanBuilderPage({ params }: PageProps<"/admin/diet-plans/[planId]">) {
  const admin = await requireGymAdmin()
  const { planId } = await params
  // Any plan in the admin's gym (gym plans, and members' personal plans
  // read-only); another gym's plan or an invalid id → 404.
  const plan = await getDietPlanDetail(admin, planId).catch(() => null)
  if (!plan) notFound()

  const foods = await listFoods(admin, { includeArchived: true })
  const personal = plan.ownerUserId !== null
  const editable = !personal && plan.status === "ACTIVE"

  return (
    <PlanBuilder
      plan={plan}
      foods={foods}
      editable={editable}
      backHref="/admin/diet-plans"
      backLabel="Diet plans"
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
            {editable && <DietPlanFormDialog plan={plan} />}
            <PlanArchiveButton planId={plan.id} archived={plan.status !== "ACTIVE"} />
          </>
        )
      }
    />
  )
}
