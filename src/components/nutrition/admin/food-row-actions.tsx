"use client"

import { useState, useTransition } from "react"
import { Archive, ArchiveRestore, Trash2 } from "lucide-react"

import { FoodFormDialog } from "@/components/nutrition/admin/food-form-dialog"
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
import { deleteFoodAction, setFoodArchivedAction } from "@/server/actions/food-actions"
import type { FoodView } from "@/types/nutrition"

export function FoodRowActions({ food }: { food: FoodView }) {
  const [error, setError] = useState<string>()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const archived = food.status === "ARCHIVED"

  function toggleArchived() {
    startTransition(async () => {
      const result = await setFoodArchivedAction(food.id, !archived)
      setError(result.ok ? undefined : result.error)
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteFoodAction(food.id)
      setError(result.ok ? undefined : result.error)
      setConfirmOpen(false)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {!archived && <FoodFormDialog food={food} />}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleArchived}
          disabled={isPending}
          aria-label={archived ? `Restore ${food.name}` : `Archive ${food.name}`}
          title={archived ? "Restore" : "Archive"}
        >
          {archived ? <ArchiveRestore /> : <Archive />}
        </Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${food.name}`} title="Delete" disabled={isPending} />
            }
          >
            <Trash2 />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {food.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the food. Foods used in a diet plan can&apos;t be deleted — archive them instead.
                Logged history is never affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={remove} disabled={isPending}>
                {isPending ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error && (
        <p role="alert" className="max-w-56 text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
