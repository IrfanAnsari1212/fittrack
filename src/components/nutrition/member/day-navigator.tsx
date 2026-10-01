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

const BASE = "/nutrition"
const hrefFor = (date: string) => `${BASE}?date=${date}`

/**
 * When the URL has no date, send the browser to its LOCAL today. The server
 * page never picks the day itself.
 */
export function EnsureLocalDate() {
  const router = useRouter()
  useEffect(() => {
    router.replace(hrefFor(localCalendarDate()))
  }, [router])
  return null
}

/** Previous/next day, jump to today, or pick any date (history). */
export function DayNavigator({ date }: { date: string }) {
  const router = useRouter()
  const today = useLocalCalendarDate()
  const isToday = today === date

  return (
    <nav aria-label="Choose day" className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" nativeButton={false} render={<Link href={hrefFor(addDays(date, -1))} aria-label="Previous day" />}>
        <ChevronLeft />
      </Button>
      <label htmlFor="nutrition-date" className="sr-only">Date</label>
      <Input
        id="nutrition-date"
        type="date"
        value={date}
        onChange={(e) => e.target.value && router.push(hrefFor(e.target.value))}
        className="w-auto"
      />
      <Button variant="outline" size="icon" nativeButton={false} render={<Link href={hrefFor(addDays(date, 1))} aria-label="Next day" />}>
        <ChevronRight />
      </Button>
      {today && !isToday && (
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={hrefFor(today)} />}>
          Today
        </Button>
      )}
    </nav>
  )
}
