"use client"

import { useState, useTransition } from "react"
import { Archive, ArchiveRestore } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ExerciseFormDialog } from "@/components/workout/admin/exercise-form-dialog"
import { setExerciseArchivedAction } from "@/server/actions/exercise-actions"
import type { ExerciseView } from "@/types/workout"

export function ExerciseRowActions({ exercise }: { exercise: ExerciseView }) {
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()
  const archived = exercise.status === "ARCHIVED"

  function toggle() {
    startTransition(async () => {
      const result = await setExerciseArchivedAction(exercise.id, !archived)
      setError(result.ok ? undefined : result.error)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {!archived && <ExerciseFormDialog exercise={exercise} />}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          disabled={isPending}
          aria-label={archived ? `Restore ${exercise.name}` : `Archive ${exercise.name}`}
          title={archived ? "Restore" : "Archive"}
        >
          {archived ? <ArchiveRestore /> : <Archive />}
        </Button>
      </div>
      {error && <p role="alert" className="max-w-56 text-right text-xs text-destructive">{error}</p>}
    </div>
  )
}
