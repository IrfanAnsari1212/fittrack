/**
 * The user's LOCAL calendar day, computed in the browser.
 *
 * This is the only source of "today" for nutrition: the server never derives
 * calendar days from its own clock (see src/lib/nutrition/calendar-date.ts).
 * Call it in event handlers or effects (not during server render).
 */
export function localCalendarDate(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD in the browser's timezone.
  return new Intl.DateTimeFormat("en-CA").format(now)
}
