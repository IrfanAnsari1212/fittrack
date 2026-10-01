"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { addDays } from "@/lib/nutrition/calendar-date"
import { localCalendarDate } from "@/lib/nutrition/local-date"
import { useLocalCalendarDate } from "@/lib/nutrition/use-local-date"

const DEFAULT_BASE = "/nutrition"
const hrefFor = (date: string, base: string) => `${base}?date=${date}`

/**
 * When the URL has no date, send the browser to its LOCAL today. The server
 * page never picks the day itself.
 */
export function EnsureLocalDate({ basePath = DEFAULT_BASE }: { basePath?: string }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(hrefFor(localCalendarDate(), basePath))
  }, [router, basePath])
  return null
}

/** Previous/next day, jump to today, or pick any date (history). */
export function DayNavigator({ date, basePath = DEFAULT_BASE }: { date: string; basePath?: string }) {
  const router = useRouter()
  const today = useLocalCalendarDate()
  const isToday = today === date

  return (
    <nav aria-label="Choose day" className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" nativeButton={false} render={<Link href={hrefFor(addDays(date, -1), basePath)} aria-label="Previous day" />}>
        <ChevronLeft />
      </Button>
      <label htmlFor="day-navigator-date" className="sr-only">Date</label>
      <Input
        id="day-navigator-date"
        type="date"
        value={date}
        onChange={(e) => e.target.value && router.push(hrefFor(e.target.value, basePath))}
        className="w-auto"
      />
      <Button variant="outline" size="icon" nativeButton={false} render={<Link href={hrefFor(addDays(date, 1), basePath)} aria-label="Next day" />}>
        <ChevronRight />
      </Button>
      {today && !isToday && (
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={hrefFor(today, basePath)} />}>
          Today
        </Button>
      )}
    </nav>
  )
}
