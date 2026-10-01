import type { Metadata } from "next"
import Link from "next/link"
import { CheckCircle2, Circle, Clock, ListChecks, Pencil, Salad } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"
import { NutritionPageSkeleton } from "@/components/nutrition/member/nutrition-page-skeleton"
import { ConsumedEntries } from "@/components/nutrition/member/consumed-entries"
import { DailySummary } from "@/components/nutrition/member/daily-summary"
import { DayNavigator, EnsureLocalDate } from "@/components/nutrition/member/day-navigator"
import { CustomizePlanButton } from "@/components/nutrition/member/customize-plan-button"
import { GoalDialog } from "@/components/nutrition/member/goal-dialog"
import { LogFoodDialog } from "@/components/nutrition/member/log-food-dialog"
import { LogMealDialog } from "@/components/nutrition/member/log-meal-dialog"
import { NutritionTotalsLine } from "@/components/nutrition/nutrition-totals"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isCalendarDate } from "@/lib/nutrition/calendar-date"
import { formatAmount, formatQuantity } from "@/lib/nutrition/format"
import { cn } from "@/lib/utils"
import { requireMember } from "@/server/auth/session"
import { listFoods } from "@/server/services/nutrition/food-service"
import { selfTarget } from "@/server/services/nutrition/member-target"
import { getNutritionDay } from "@/server/services/nutrition/nutrition-day-service"

export const metadata: Metadata = { title: "Nutrition" }

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`)
  )

/**
 * Member nutrition for one LOCAL calendar day, taken from `?date=`. Without
 * a date the browser redirects to its own today — the server never derives it.
 */
export default async function NutritionPage({ searchParams }: PageProps<"/nutrition">) {
  const member = await requireMember()
  const { date } = await searchParams

  if (!isCalendarDate(date)) {
    return (
      <>
        <EnsureLocalDate />
        <NutritionPageSkeleton />
      </>
    )
  }

  const target = selfTarget(member)
  const [day, foods] = await Promise.all([getNutritionDay(target, date), listFoods(member)])
  const meals = day.plan?.plan.meals ?? []
  const completed = new Set(day.completedMealIds)
  const mealNames = Object.fromEntries(meals.map((m) => [m.id, m.name]))
  const foodOptions = foods.map(({ id, name, servingSize, servingUnit }) => ({ id, name, servingSize, servingUnit }))

  return (
    <div className="space-y-6">
      <PageHeader title="Nutrition" description={dayLabel(date)} actions={
          <>
            <DayNavigator date={date} />
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/nutrition/plans" />}>
              <ListChecks data-icon="inline-start" />
              My plans
            </Button>
          </>
        }
      />

      <DailySummary consumed={day.consumed} progress={day.progress} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {/* PLANNED nutrition */}
          <Card>
            <CardHeader>
              <CardTitle>{day.plan ? day.plan.plan.name : "Diet plan"}</CardTitle>
              <CardDescription>
                {day.plan ? (
                  <>Planned for this day: <NutritionTotalsLine totals={day.plan.plan.totals} className="inline" /></>
                ) : (
                  "Your plan for the day"
                )}
              </CardDescription>
              {day.plan && (
                <CardAction className="flex flex-wrap items-start justify-end gap-2">
                  {meals.length > 0 && (
                    <Badge variant="secondary">
                      {meals.filter((m) => completed.has(m.id)).length}/{meals.length} logged
                    </Badge>
                  )}
                  {day.plan.assignment.dietPlanKind === "PERSONAL" ? (
                    <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/nutrition/plans/${day.plan.plan.id}`} />}>
                      <Pencil data-icon="inline-start" />
                      Edit my plan
                    </Button>
                  ) : (
                    day.plan.assignment.status === "ACTIVE" && <CustomizePlanButton planName={day.plan.plan.name} />
                  )}
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              {!day.plan ? (
                <EmptyState
                  icon={Salad}
                  title="No active diet plan for today."
                  description="Your gym can assign you one, or you can create your own. You can still log what you eat."
                  action={
                    <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/nutrition/plans" />}>
                      My diet plans
                    </Button>
                  }
                />
              ) : meals.length === 0 ? (
                <p className="text-sm text-muted-foreground">This plan has no meals yet.</p>
              ) : (
                <ul className="space-y-3">
                  {meals.map((meal) => {
                    const done = completed.has(meal.id)
                    const StatusIcon = done ? CheckCircle2 : Circle
                    return (
                      <li key={meal.id} className={cn("rounded-lg border p-3", done && "bg-muted/40")}>
                        <div className="flex flex-wrap items-start gap-3">
                          <StatusIcon
                            className={cn("mt-0.5 size-5 shrink-0", done ? "text-primary" : "text-muted-foreground")}
                            aria-label={done ? "Logged" : "Not logged yet"}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">
                              {meal.name}
                              <span className="ml-2 inline-flex items-center gap-1 text-sm font-normal text-muted-foreground">
                                <Clock className="size-3.5" aria-hidden />
                                {meal.time}
                              </span>
                            </p>
                            <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                              {meal.foods.map((f) => (
                                <li key={f.id}>
                                  {f.foodName} × {formatQuantity(f.quantity, f.unit)}
                                </li>
                              ))}
                            </ul>
                            <NutritionTotalsLine totals={meal.totals} className="mt-1" showOptional={false} />
                          </div>
                          <LogMealDialog date={date} meal={meal} logged={done} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ACTUAL nutrition */}
          <Card>
            <CardHeader>
              <CardTitle>What you ate</CardTitle>
              <CardDescription>Recorded entries keep the nutrition values from when they were logged.</CardDescription>
              <CardAction>
                <LogFoodDialog date={date} foods={foodOptions} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <ConsumedEntries date={date} entries={day.log?.entries ?? []} mealNames={mealNames} />
              {foods.length === 0 && (
                <p className="mt-3 text-xs text-muted-foreground">Your gym food library is empty, so there&apos;s nothing to log yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Daily goal</CardTitle>
            <CardAction>
              <GoalDialog goal={day.goal} />
            </CardAction>
          </CardHeader>
          <CardContent>
            {day.goal ? (
              <dl className="space-y-2 text-sm">
                {[
                  ["Calories", `${formatAmount(day.goal.dailyCalories)} kcal`],
                  ["Protein", `${formatAmount(day.goal.dailyProtein)} g`],
                  ["Carbs", day.goal.dailyCarbs == null ? "—" : `${formatAmount(day.goal.dailyCarbs)} g`],
                  ["Fat", day.goal.dailyFat == null ? "—" : `${formatAmount(day.goal.dailyFat)} g`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
                <p className="pt-1 text-xs text-muted-foreground">In effect since {day.goal.effectiveFrom}</p>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No nutrition goal has been set yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
