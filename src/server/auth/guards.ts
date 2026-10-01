import type { GymAdminUser, SuperAdminUser } from "@/types/auth"

/**
 * Defense in depth for services. The types already force callers through the
 * Data Access Layer; these runtime asserts catch a forged/mis-cast context.
 */

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message)
    this.name = "ForbiddenError"
  }
}

export function assertSuperAdmin(actor: SuperAdminUser) {
  if (actor?.role !== "SUPER_ADMIN") throw new ForbiddenError()
}

export function assertGymAdmin(actor: GymAdminUser) {
  if (actor?.role !== "GYM_ADMIN" || !actor.gymId) throw new ForbiddenError()
}
