"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Copy } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { localCalendarDate } from "@/lib/nutrition/local-date"
import { customizeMyDietPlanAction } from "@/server/actions/nutrition-actions"

/**
 * "Customize this plan": the server copies the gym's plan into a personal
 * plan for me only (from my local today) and I'm taken to edit the copy.
 * The gym's plan and other members on it are never changed.
 */
export function CustomizePlanButton({ planName }: { planName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const result = await customizeMyDietPlanAction(localCalendarDate())
      if (result.ok && result.data) {
        setOpen(false)
        router.push(`/nutrition/plans/${result.data.planId}`)
      } else {
        setError(result.ok ? undefined : result.error)
        setOpen(false)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={isPending} />}>
          <Copy data-icon="inline-start" />
          Customize
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Customize “{planName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              We&apos;ll make your own copy of this plan, starting today, that only you can change. Your gym&apos;s plan
              stays as it is for everyone else, and your earlier days keep the gym plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={isPending}>
              {isPending ? "Copying…" : "Make my copy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
