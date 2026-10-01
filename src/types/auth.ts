import type { Role } from "@/lib/auth/roles"

/**
 * The authenticated user as the app sees it. Always loaded fresh from the
 * database (never trusted from the client), and safe to pass to the client:
 * it contains no password hash or other sensitive fields.
 */
export interface SessionUser {
  id: string
  name: string
  email: string
  image: string | null
  role: Role
  /** Null only for SUPER_ADMIN. */
  gymId: string | null
  gymName: string | null
}

/** A user that belongs to a gym (GYM_ADMIN or MEMBER). */
export interface GymUser extends SessionUser {
  role: "GYM_ADMIN" | "MEMBER"
  gymId: string
  gymName: string
}

export interface GymAdminUser extends GymUser {
  role: "GYM_ADMIN"
}

export interface MemberUser extends GymUser {
  role: "MEMBER"
}

export interface SuperAdminUser extends SessionUser {
  role: "SUPER_ADMIN"
  gymId: null
}
