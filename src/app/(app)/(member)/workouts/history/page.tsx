import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, History } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WorkoutHistoryList } from "@/components/workout/workout-history-list"
import { isCalendarDate } from "@/lib/nutrition/calendar-date"
import { requireMember } from "@/server/auth/session"
import { selfTarget } from "@/server/services/nutrition/member-target"
import { listWorkoutHistory } from "@/server/services/workout/workout-session-service"

export const metadata: Metadata = { title: "Workout history" }

const validDate = (value: string | string[] | undefined) => (typeof value === "string" && isCalendarDate(value) ? value : undefined)

/**
 * Completed workouts, newest first. Optional `from`/`to` are calendar days
 * chosen by the member (date inputs) — the server never invents a range.
 */
export default async function WorkoutHistoryPage({ searchParams }: PageProps<"/workouts/history">) {
  const member = await requireMember()
  const params = await searchParams
  let from = validDate(params.from)
  let to = validDate(params.to)
  if (from && to && from > to) [from, to] = [to, from]
  const sessions = await listWorkoutHistory(selfTarget(member), { from, to, limit: 50 })

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/workouts" />}>
        <ArrowLeft data-icon="inline-start" />
        Workouts
      </Button>
      <PageHeader title="Workout history" description="What you actually did, set by set." />

      <form className="flex flex-wrap items-end gap-3" role="search" aria-label="Filter by date">
        <div className="space-y-1">
          <Label htmlFor="history-from">From</Label>
          <Input id="history-from" name="from" type="date" defaultValue={from} className="w-auto" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="history-to">To</Label>
          <Input id="history-to" name="to" type="date" defaultValue={to} className="w-auto" />
        </div>
        <Button type="submit" variant="outline">Filter</Button>
        {(from || to) && (
          <Button variant="ghost" nativeButton={false} render={<Link href="/workouts/history" />}>
            Clear
          </Button>
        )}
      </form>

      {sessions.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={History}
              title={from || to ? "No workouts in this range" : "No workouts logged yet"}
              description={from || to ? undefined : "Finished workouts show up here."}
            />
          </CardContent>
        </Card>
      ) : (
        <WorkoutHistoryList sessions={sessions} />
      )}
    </div>
  )
}
