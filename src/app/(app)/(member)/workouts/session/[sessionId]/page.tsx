import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CheckCircle2 } from "lucide-react"

import { PageHeader } from "@/components/common/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { SessionLogger } from "@/components/workout/member/session-logger"
import { SessionPerformance } from "@/components/workout/performance/session-performance"
import { formatCalendarDay, formatDuration } from "@/lib/workout/format"
import { requireMember } from "@/server/auth/session"
import { selfTarget } from "@/server/services/nutrition/member-target"
import { getSessionPerformance } from "@/server/services/workout/performance-service"
import { getWorkoutSession } from "@/server/services/workout/workout-session-service"

export const metadata: Metadata = { title: "Workout" }

/** One of MY workouts (live logging while in progress, read-only after). Anyone else's → 404. */
export default async function WorkoutSessionPage({ params }: PageProps<"/workouts/session/[sessionId]">) {
  const member = await requireMember()
  const { sessionId } = await params
  const session = await getWorkoutSession(selfTarget(member), sessionId).catch(() => null)
  if (!session) notFound()

  const finished = session.status === "COMPLETED"
  const performance = finished ? await getSessionPerformance(selfTarget(member), session.id) : []

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/workouts" />}>
        <ArrowLeft data-icon="inline-start" />
        Workouts
      </Button>
      <PageHeader
        title={session.dayName}
        description={`${session.planName} · ${formatCalendarDay(session.date)}${finished && formatDuration(session.durationSeconds) ? ` · ${formatDuration(session.durationSeconds)}` : ""}`}
      />
      {finished && (
        <Alert role="status">
          <CheckCircle2 />
          <AlertDescription>Workout saved. It&apos;s in your history and can no longer be edited.</AlertDescription>
        </Alert>
      )}
      {finished && <SessionPerformance performance={performance} />}
      <SessionLogger session={session} />
    </div>
  )
}
