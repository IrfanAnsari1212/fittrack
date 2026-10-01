import { Schema } from "mongoose"

import { SERVING_UNITS } from "@/lib/nutrition/units"

/**
 * Field definitions shared by gym-owned models. `gymId`/`userId` are
 * immutable: a record can never be moved to another tenant or member.
 */
export const tenantField = {
  type: Schema.Types.ObjectId,
  ref: "Gym",
  required: true,
  immutable: true,
} as const

export const memberField = {
  type: Schema.Types.ObjectId,
  ref: "User",
  required: true,
  immutable: true,
} as const

export function refField(ref: string, { immutable = true } = {}) {
  return { type: Schema.Types.ObjectId, ref, required: true, immutable } as const
}

/** "YYYY-MM-DD" calendar day (see src/lib/nutrition/calendar-date.ts). */
export const calendarDateField = {
  type: String,
  match: /^\d{4}-\d{2}-\d{2}$/,
} as const

export const nonNegative = (max: number) => ({ type: Number, min: 0, max }) as const

export const servingUnitField = { type: String, enum: SERVING_UNITS, required: true } as const
