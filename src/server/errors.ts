export type DomainErrorCode = "EMAIL_TAKEN" | "NOT_FOUND"

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

export function isDuplicateKeyError(error: unknown, field?: string) {
  if (typeof error !== "object" || error === null) return false
  const e = error as { code?: number; keyPattern?: Record<string, unknown> }
  return e.code === 11000 && (!field || Boolean(e.keyPattern?.[field]))
}
