"use client"

import { useState } from "react"
import { Target } from "lucide-react"

import { GoalForm } from "@/components/nutrition/goal-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { setMyGoalAction } from "@/server/actions/nutrition-actions"
import type { NutritionGoalView } from "@/types/nutrition"

export function GoalDialog({ goal }: { goal: NutritionGoalView | null }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Target data-icon="inline-start" />
        {goal ? "Change goal" : "Set goal"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Daily nutrition goal</DialogTitle>
          <DialogDescription>Your targets from the chosen day onwards.</DialogDescription>
        </DialogHeader>
        {open && <GoalForm action={setMyGoalAction} goal={goal} />}
      </DialogContent>
    </Dialog>
  )
}
