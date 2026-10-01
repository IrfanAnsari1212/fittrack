import { Types } from "mongoose"

/**
 * Tenant scoping helpers. Every query on gym-owned data goes through one of
 * these so the tenant condition is applied in one place.
 *
 * The tenant keys are applied LAST, so a caller-supplied filter can never
 * override them (e.g. `{ gymId: "<other gym>" }` from a form is overwritten).
 */

/** Minimal context needed to scope a query. Always derived from the session. */
export interface TenantScope {
  gymId: string
}

export interface MemberScope extends TenantScope {
  /** The authenticated user's id. */
  id: string
}

/** For gym-owned data: `filter AND gymId = ctx.gymId`. */
export function scopeToGym<F extends object>(ctx: TenantScope, filter?: F) {
  return { ...filter, gymId: new Types.ObjectId(ctx.gymId) }
}

/**
 * For member-owned data (meals, workouts, logs…):
 * `filter AND gymId = ctx.gymId AND userId = ctx.id`.
 */
export function scopeToMember<F extends object>(ctx: MemberScope, filter?: F) {
  return {
    ...filter,
    gymId: new Types.ObjectId(ctx.gymId),
    userId: new Types.ObjectId(ctx.id),
  }
}

/** Reject malformed ids up front (avoids CastErrors → 500s). */
export function isValidId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f\d]{24}$/i.test(id)
}
