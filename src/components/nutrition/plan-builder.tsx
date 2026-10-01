import Link from "next/link"
import { ArrowLeft, Clock, Info, UtensilsCrossed } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"
import { MealControls } from "@/components/nutrition/admin/meal-controls"
import { AddMealFoodDialog, EditMealFoodDialog } from "@/components/nutrition/admin/meal-food-dialog"
import { MealFormDialog } from "@/components/nutrition/admin/meal-form-dialog"
import { RemoveMealFoodButton } from "@/components/nutrition/admin/remove-meal-food-button"
import { NutritionTotalsGrid, NutritionTotalsLine } from "@/components/nutrition/nutrition-totals"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatQuantity } from "@/lib/nutrition/format"
import type { DietPlanDetail, FoodView } from "@/types/nutrition"

/**
 * Plan → meals → planned foods, with editing controls when `editable`.
 * Shared by the Gym Admin builder (gym plans) and the member's own plans.
 * The controls call role-aware actions; the server decides what may change.
 */
export function PlanBuilder({
  plan,
  foods,
  editable,
  notice,
  headerActions,
  backHref,
  backLabel,
}: {
  plan: DietPlanDetail
  /** Foods the viewer can see (used for units and the picker). */
  foods: FoodView[]
  editable: boolean
  /** Shown when the plan is read-only or otherwise noteworthy. */
  notice?: React.ReactNode
  headerActions?: React.ReactNode
  backHref: string
  backLabel: string
}) {
  const unitByFood = new Map(foods.map((f) => [f.id, f.servingUnit]))
  const pickable = foods
    .filter((f) => f.status === "ACTIVE")
    .map(({ id, name, servingSize, servingUnit }) => ({ id, name, servingSize, servingUnit }))
  const orderedMealIds = plan.meals.map((m) => m.id)

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={backHref} />}>
        <ArrowLeft data-icon="inline-start" />
        {backLabel}
      </Button>
      <PageHeader title={plan.name} description={plan.description ?? undefined} actions={headerActions} />

      {notice && (
        <Alert>
          <Info />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Planned daily total</CardTitle>
          <CardDescription>Sum of all meals below. This is the plan — not what was actually eaten.</CardDescription>
          <CardAction className="flex gap-1">
            {plan.ownerUserId && <Badge variant="outline">Personal plan</Badge>}
            <StatusBadge status={plan.status} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <NutritionTotalsGrid totals={plan.totals} label="Planned daily total" />
        </CardContent>
      </Card>

      <section aria-labelledby="meals-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="meals-heading" className="text-lg font-semibold">Meals</h2>
          {editable && <MealFormDialog planId={plan.id} />}
        </div>

        {editable && pickable.length === 0 && (
          <Alert>
            <Info />
            <AlertDescription>Your gym food library is empty, so there are no foods to add yet.</AlertDescription>
          </Alert>
        )}

        {plan.meals.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="No meals yet" description={editable ? "Add your first meal, e.g. Breakfast at 08:00." : undefined} />
        ) : (
          <ol className="space-y-4">
            {plan.meals.map((meal, index) => (
              <li key={meal.id}>
                <Card className="gap-3">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="tabular-nums">{index + 1}</Badge>
                      {meal.name}
                      <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                        <Clock className="size-3.5" aria-hidden />
                        {meal.time}
                      </span>
                    </CardTitle>
                    <CardDescription>
                      <NutritionTotalsLine totals={meal.totals} />
                    </CardDescription>
                    {editable && (
                      <CardAction className="flex items-start gap-1">
                        <MealFormDialog planId={plan.id} meal={meal} />
                        <MealControls planId={plan.id} mealId={meal.id} mealName={meal.name} orderedMealIds={orderedMealIds} />
                      </CardAction>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {meal.foods.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No foods in this meal yet.</p>
                    ) : (
                      <ul className="divide-y rounded-lg border">
                        {meal.foods.map((item) => (
                          <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {item.foodName}
                                <span className="font-normal text-muted-foreground"> × {formatQuantity(item.quantity, item.unit)}</span>
                                {item.foodStatus === "ARCHIVED" && <Badge variant="outline" className="ml-2">Archived food</Badge>}
                              </p>
                              <NutritionTotalsLine totals={item.nutrition} showOptional={false} />
                            </div>
                            {editable && (
                              <div className="flex items-center">
                                <EditMealFoodDialog planId={plan.id} item={item} servingUnit={unitByFood.get(item.foodId) ?? item.unit} />
                                <RemoveMealFoodButton planId={plan.id} mealFoodId={item.id} foodName={item.foodName} />
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {editable && <AddMealFoodDialog planId={plan.id} mealId={meal.id} mealName={meal.name} foods={pickable} />}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
