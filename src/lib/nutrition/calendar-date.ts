/**
 * Calendar days are stored as "YYYY-MM-DD" strings, not Date objects:
 * a member's day must not shift with server timezones, and string order
 * equals chronological order (so $lte/$gte and sorting just work).
 *
 * RULE: user-facing calendar dates ("today", a goal's start day, a plan's
 * start/end day, a log's day) are ALWAYS supplied by the caller, computed in
 * the relevant user/gym timezone. The server never derives them from its own
 * clock — on a UTC server it is still "yesterday" for a member in India
 * shortly after their midnight, which would store the wrong day.
 * (There is deliberately no server-side "today" helper here.)
 */
export type CalendarDate = string

const PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== "string" || !PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Pure date arithmetic on calendar days (no clock involved). */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
