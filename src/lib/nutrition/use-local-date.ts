"use client"

import { useSyncExternalStore } from "react"

import { localCalendarDate } from "@/lib/nutrition/local-date"

const subscribe = () => () => {}

/**
 * The user's local calendar day in a client component. Returns "" during
 * server render / hydration (the server never guesses the day), then the
 * browser's local "YYYY-MM-DD".
 */
export function useLocalCalendarDate(): string {
  return useSyncExternalStore(subscribe, () => localCalendarDate(), () => "")
}
