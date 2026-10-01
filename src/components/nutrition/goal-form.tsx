"use client"

import { useActionState } from "react"

import { FormAlert } from "@/components/forms/form-alert"
import { FormField } from "@/components/forms/form-field"
import { LocalDateField } from "@/components/forms/local-date-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { initialFormState, type FormState } from "@/lib/form-state"
import type { NutritionGoalView } from "@/types/nutrition"

/**
 * Daily nutrition goal form, shared by the member (own goal) and the gym
 * admin (a member's goal) — the action decides whose goal it is, server-side.
 * "Effective from" defaults to the user's local today.
 */
export function GoalForm({
  action,
  goal,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  goal?: NutritionGoalView | null
}) {
  const [state, formAction] = useActionState(action, initialFormState)
  const num = (v: number | null | undefined) => (v == null ? "" : String(v))

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={state} />
      <div className="grid grid-cols-2 gap-3">
        <FormField name="dailyCalories" label="Calories (kcal)" type="number" step="1" min="0" required defaultValue={num(goal?.dailyCalories)} state={state} />
        <FormField name="dailyProtein" label="Protein (g)" type="number" step="any" min="0" required defaultValue={num(goal?.dailyProtein)} state={state} />
        <FormField name="dailyCarbs" label="Carbs (g)" type="number" step="any" min="0" defaultValue={num(goal?.dailyCarbs)} state={state} />
        <FormField name="dailyFat" label="Fat (g)" type="number" step="any" min="0" defaultValue={num(goal?.dailyFat)} state={state} />
      </div>
      <LocalDateField
        name="effectiveFrom"
        label="Effective from"
        required
        state={state}
        description="The goal applies from this day on (your local date). Re-saving the same day updates it."
      />
      <SubmitButton pendingLabel="Saving…">Save goal</SubmitButton>
    </form>
  )
}
