/**
 * Role and status constants shared by server and client code.
 * Keep this file free of server-only imports (it is used by navigation).
 */

export const ROLES = ["SUPER_ADMIN", "GYM_ADMIN", "MEMBER"] as const
export type Role = (typeof ROLES)[number]

export const USER_STATUSES = ["ACTIVE", "DISABLED"] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export const GYM_STATUSES = ["ACTIVE", "SUSPENDED"] as const
export type GymStatus = (typeof GYM_STATUSES)[number]

export const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  GYM_ADMIN: "Gym Admin",
  MEMBER: "Member",
}

/** Where each role lands after login and when following the logo. */
export function homePathFor(role: Role) {
  switch (role) {
    case "SUPER_ADMIN":
      return "/super-admin"
    case "GYM_ADMIN":
      return "/admin"
    case "MEMBER":
      return "/dashboard"
  }
}
