"use client"

import { useRouter } from "next/navigation"

import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ProgressExercise } from "@/types/performance"

/** Exercise picker: navigates to `${basePath}?exercise=<id>` (all data is loaded server-side per member). */
export function ExerciseSelect({
  exercises,
  selectedId,
  basePath,
}: {
  exercises: ProgressExercise[]
  selectedId: string | null
  basePath: string
}) {
  const router = useRouter()
  return (
    <div className="space-y-1">
      <Label htmlFor="progress-exercise">Exercise</Label>
      <NativeSelect
        id="progress-exercise"
        value={selectedId ?? ""}
        onChange={(e) => router.push(`${basePath}?exercise=${e.target.value}`)}
        className="w-full sm:w-72"
      >
        {exercises.map((e) => (
          <NativeSelectOption key={e.exerciseId} value={e.exerciseId}>
            {e.name} ({e.sessionCount} {e.sessionCount === 1 ? "session" : "sessions"})
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}
