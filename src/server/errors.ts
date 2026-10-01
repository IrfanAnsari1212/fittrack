import type { z } from "zod"

export type DomainErrorCode =
  | "EMAIL_TAKEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "PLAN_ARCHIVED"
  | "FOOD_ARCHIVED"
  | "FOOD_IN_USE"
  | "UNIT_MISMATCH"
  | "CONFLICT"
  | "ACTIVE_ASSIGNMENT_EXISTS"
  | "ACTIVE_WORKOUT_ASSIGNMENT_EXISTS"
  | "EXERCISE_ARCHIVED"
  | "SESSION_IN_PROGRESS"
  | "SESSION_CLOSED"
  | "EMPTY_SESSION"

/** Expected, user-facing failures thrown by services. */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message?: string
  ) {
    super(message ?? code)
    this.name = "DomainError"
  }
}

/** Invalid input, with per-field messages safe to show to users. */
export class ValidationError extends DomainError {
  constructor(public readonly fieldErrors: Record<string, string[] | undefined>) {
    super("INVALID_INPUT")
    this.name = "ValidationError"
  }
}

/**
 * Validate service input. Services validate themselves (not only actions),
 * so every caller — server action, script or test — gets the same checks.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form"
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  throw new ValidationError(fieldErrors)
}

export function isDuplicateKeyError(error: unknown, field?: string) {
  if (typeof error !== "object" || error === null) return false
  const e = error as { code?: number; keyPattern?: Record<string, unknown> }
  return e.code === 11000 && (!field || Boolean(e.keyPattern?.[field]))
}
