import type { Metadata } from "next"
import Link from "next/link"
import { Dumbbell, Search } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ExerciseFormDialog } from "@/components/workout/admin/exercise-form-dialog"
import { ExerciseRowActions } from "@/components/workout/admin/exercise-row-actions"
import { cn } from "@/lib/utils"
import { EXERCISE_CATEGORY_LABELS, MUSCLE_GROUPS } from "@/lib/workout/constants"
import { requireGymAdmin } from "@/server/auth/session"
import { listExercises } from "@/server/services/workout/exercise-service"

export const metadata: Metadata = { title: "Exercise library" }

const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined)

export default async function ExerciseLibraryPage({ searchParams }: PageProps<"/admin/exercises">) {
  const admin = await requireGymAdmin()
  const params = await searchParams
  const query = first(params.q)
  const muscleGroup = first(params.muscle)
  const showArchived = params.archived === "1"
  // Scoped to the admin's gym inside the service; filters are whitelisted there.
  const exercises = await listExercises(admin, { query, muscleGroup, includeArchived: showArchived })

  const filterHref = (archived: boolean) => {
    const sp = new URLSearchParams()
    if (query) sp.set("q", query)
    if (muscleGroup) sp.set("muscle", muscleGroup)
    if (archived) sp.set("archived", "1")
    const qs = sp.toString()
    return `/admin/exercises${qs ? `?${qs}` : ""}`
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exercise library"
        description={`Exercises available to ${admin.gymName}'s workout plans and members.`}
        actions={<ExerciseFormDialog />}
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <form role="search" className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <label htmlFor="exercise-search" className="sr-only">Search exercises</label>
                <Input id="exercise-search" name="q" type="search" placeholder="Search exercises" defaultValue={query} className="pl-8" />
              </div>
              <label htmlFor="exercise-muscle" className="sr-only">Muscle group</label>
              <NativeSelect id="exercise-muscle" name="muscle" defaultValue={muscleGroup ?? ""} className="sm:w-44">
                <NativeSelectOption value="">All muscle groups</NativeSelectOption>
                {MUSCLE_GROUPS.map((g) => (
                  <NativeSelectOption key={g} value={g}>{g}</NativeSelectOption>
                ))}
              </NativeSelect>
              {showArchived && <input type="hidden" name="archived" value="1" />}
              <Button type="submit" variant="outline">Filter</Button>
            </form>
            <div className="flex gap-1 text-sm" role="group" aria-label="Status filter">
              {[
                { label: "Active", archived: false },
                { label: "All incl. archived", archived: true },
              ].map((f) => (
                <Link
                  key={f.label}
                  href={filterHref(f.archived)}
                  aria-current={showArchived === f.archived ? "true" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1 transition-colors",
                    showArchived === f.archived ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>

          {exercises.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title={query || muscleGroup ? "No matching exercises" : "Your exercise library is empty."}
              description={query || muscleGroup ? "Try a different search or filter." : "Add exercises to build workout plans."}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exercise</TableHead>
                  <TableHead>Muscle group</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exercises.map((exercise) => (
                  <TableRow key={exercise.id} className={cn(exercise.status === "ARCHIVED" && "opacity-70")}>
                    <TableCell>
                      <p className="font-medium">{exercise.name}</p>
                      {exercise.equipment && <p className="text-xs text-muted-foreground">{exercise.equipment}</p>}
                    </TableCell>
                    <TableCell>{exercise.muscleGroup}</TableCell>
                    <TableCell className="hidden md:table-cell">{EXERCISE_CATEGORY_LABELS[exercise.category]}</TableCell>
                    <TableCell className="hidden sm:table-cell"><StatusBadge status={exercise.status} /></TableCell>
                    <TableCell className="text-right"><ExerciseRowActions exercise={exercise} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
