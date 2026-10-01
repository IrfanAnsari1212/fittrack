import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { ProgressBody } from "@/components/workout/performance/progress-body"
import { requireMember } from "@/server/auth/session"
import { selfTarget } from "@/server/services/nutrition/member-target"

export const metadata: Metadata = { title: "Workout progress" }

/** My exercise progress: records, comparison, trends and a conservative recommendation. */
export default async function WorkoutProgressPage({ searchParams }: PageProps<"/workouts/progress">) {
  const member = await requireMember()
  const params = await searchParams
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/workouts" />}>
        <ArrowLeft data-icon="inline-start" />
        Workouts
      </Button>
      <PageHeader title="Workout progress" description="How your lifts are changing, from the workouts you completed." />
      <ProgressBody target={selfTarget(member)} searchParams={params} basePath="/workouts/progress" canApply />
    </div>
  )
}
