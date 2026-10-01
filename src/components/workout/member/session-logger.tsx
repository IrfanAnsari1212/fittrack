"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, CheckCircle2, Circle, Loader2, Plus, Trash2 } from "lucide-react"

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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatRest, formatTarget } from "@/lib/workout/format"
import {
  addSetAction,
  discardWorkoutAction,
  finishWorkoutAction,
  removeSetAction,
  setExerciseCompletedAction,
  updateSetAction,
} from "@/server/actions/workout-actions"
import type { ExerciseSessionView, SetLogView, WorkoutSessionView } from "@/types/workout"

/**
 * Live workout logging, designed for a phone in the gym: big number inputs
 * (numeric keypads), one tap to complete a set, no dialogs for entering
 * weight/reps. Inputs are pre-filled with the PLANNED target as a starting
 * point only — what is saved is whatever the member actually entered, and
 * the plan is never modified.
 */

function SetRow({ sessionId, exercise, set, readOnly }: { sessionId: string; exercise: ExerciseSessionView; set: SetLogView; readOnly: boolean }) {
  const planned = exercise.planned
  const [weight, setWeight] = useState(set.weight != null ? String(set.weight) : planned.targetWeight != null ? String(planned.targetWeight) : "")
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : String(planned.repsMax ?? planned.repsMin))
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()
  const locked = readOnly || set.completed

  function save(completed: boolean) {
    startTransition(async () => {
      const result = await updateSetAction(sessionId, set.id, {
        weight: weight.trim() === "" ? null : weight,
        weightUnit: set.weightUnit,
        reps: reps.trim() === "" ? null : reps,
        completed,
      })
      setError(result.ok ? undefined : (result.fieldErrors?.reps?.[0] ?? result.fieldErrors?.weight?.[0] ?? result.error))
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await removeSetAction(sessionId, set.id)
      setError(result.ok ? undefined : result.error)
    })
  }

  return (
    <li className="space-y-1">
      <div className={cn("grid grid-cols-[1.75rem_1fr_1fr_auto] items-center gap-2", set.completed && "opacity-90")}>
        <span className="text-center text-sm font-medium text-muted-foreground tabular-nums">{set.setNumber}</span>
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          disabled={locked || isPending}
          placeholder="BW"
          aria-label={`Set ${set.setNumber} weight (${set.weightUnit})`}
          className="h-11 text-center text-base"
        />
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          disabled={locked || isPending}
          aria-label={`Set ${set.setNumber} reps`}
          className="h-11 text-center text-base"
        />
        {readOnly ? (
          set.completed ? <CheckCircle2 className="size-5 text-primary" aria-label="Completed" /> : <span className="w-9" />
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant={set.completed ? "default" : "outline"}
              size="icon-lg"
              onClick={() => save(!set.completed)}
              disabled={isPending}
              aria-pressed={set.completed}
              aria-label={set.completed ? `Set ${set.setNumber} done — tap to edit` : `Complete set ${set.setNumber}`}
              title={set.completed ? "Done — tap to edit" : "Complete set"}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={remove} disabled={isPending} aria-label={`Remove set ${set.setNumber}`} title="Remove set">
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      {error && <p role="alert" className="pl-8 text-xs text-destructive">{error}</p>}
    </li>
  )
}

function ExerciseCard({ sessionId, exercise, readOnly }: { sessionId: string; exercise: ExerciseSessionView; readOnly: boolean }) {
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()
  const unit = exercise.sets[0]?.weightUnit ?? exercise.planned.weightUnit
  const done = exercise.sets.filter((s) => s.completed).length

  function toggleCompleted() {
    startTransition(async () => {
      const result = await setExerciseCompletedAction(sessionId, exercise.id, !exercise.completed)
      setError(result.ok ? undefined : result.error)
    })
  }

  function addSet() {
    startTransition(async () => {
      const last = exercise.sets[exercise.sets.length - 1]
      const result = await addSetAction(sessionId, exercise.id, { weightUnit: unit, weight: last?.weight ?? null })
      setError(result.ok ? undefined : result.error)
    })
  }

  return (
    <Card className={cn("gap-3", exercise.completed && "bg-muted/30")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {exercise.completed ? <CheckCircle2 className="size-5 text-primary" aria-hidden /> : <Circle className="size-5 text-muted-foreground" aria-hidden />}
          {exercise.exerciseName}
        </CardTitle>
        <CardDescription className="tabular-nums">
          Target: {formatTarget(exercise.planned)}
          {formatRest(exercise.planned.restSeconds) && <> · {formatRest(exercise.planned.restSeconds)}</>}
          {exercise.planned.notes && <span className="block">{exercise.planned.notes}</span>}
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">{done} done</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[1.75rem_1fr_1fr_auto] gap-2 text-xs text-muted-foreground" aria-hidden>
          <span className="text-center">Set</span>
          <span className="text-center">Weight ({unit})</span>
          <span className="text-center">Reps</span>
          <span className={readOnly ? "w-9" : "w-[5.75rem]"} />
        </div>
        <ul className="space-y-2">
          {exercise.sets.map((set) => (
            <SetRow key={set.id} sessionId={sessionId} exercise={exercise} set={set} readOnly={readOnly} />
          ))}
        </ul>
        {!readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={addSet} disabled={isPending}>
              <Plus data-icon="inline-start" />
              Add set
            </Button>
            <Button variant={exercise.completed ? "secondary" : "outline"} size="sm" onClick={toggleCompleted} disabled={isPending}>
              <Check data-icon="inline-start" />
              {exercise.completed ? "Marked complete" : "Mark exercise complete"}
            </Button>
          </div>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

export function SessionLogger({ session }: { session: WorkoutSessionView }) {
  const router = useRouter()
  const readOnly = session.status !== "IN_PROGRESS"
  const [finishOpen, setFinishOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()
  const completedSets = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0)

  function finish() {
    startTransition(async () => {
      const result = await finishWorkoutAction(session.id)
      setError(result.ok ? undefined : result.error)
      setFinishOpen(false)
    })
  }

  function discard() {
    startTransition(async () => {
      const result = await discardWorkoutAction(session.id)
      if (result.ok) router.push("/workouts")
      else {
        setError(result.error)
        setDiscardOpen(false)
      }
    })
  }

  return (
    <div className="space-y-4">
      {session.exercises.map((exercise) => (
        <ExerciseCard key={exercise.id} sessionId={session.id} exercise={exercise} readOnly={readOnly} />
      ))}

      {!readOnly && (
        <div className="sticky bottom-2 z-10 space-y-2 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
              <AlertDialogTrigger render={<Button variant="ghost" disabled={isPending} />}>Discard</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard this workout?</AlertDialogTitle>
                  <AlertDialogDescription>Everything you logged in this workout is deleted. This can&apos;t be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPending}>Keep logging</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={discard} disabled={isPending}>
                    Discard workout
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={finishOpen} onOpenChange={setFinishOpen}>
              <AlertDialogTrigger render={<Button size="lg" disabled={isPending} />}>
                <Check data-icon="inline-start" />
                Finish workout
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Finish this workout?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {completedSets} {completedSets === 1 ? "set" : "sets"} completed. Sets you didn&apos;t complete are not saved, and the
                    workout can&apos;t be edited afterwards.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPending}>Keep logging</AlertDialogCancel>
                  <AlertDialogAction onClick={finish} disabled={isPending}>
                    {isPending ? "Saving…" : "Finish workout"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </div>
  )
}
