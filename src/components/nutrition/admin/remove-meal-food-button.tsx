"use client"

import { useState, useTransition } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { removeMealFoodAction } from "@/server/actions/diet-plan-actions"

export function RemoveMealFoodButton({ planId, mealFoodId, foodName }: { planId: string; mealFoodId: string; foodName: string }) {
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()
  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={isPending}
        aria-label={`Remove ${foodName}`}
        title="Remove from meal"
        onClick={() =>
          startTransition(async () => {
            const result = await removeMealFoodAction(planId, mealFoodId)
            setError(result.ok ? undefined : result.error)
          })
        }
      >
        <X />
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </>
  )
}
