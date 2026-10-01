import type { Role } from "@/lib/auth/roles"

/**
 * Which roles may open which URL prefixes. Used by `proxy.ts` for fast,
 * optimistic checks. The authoritative checks live in the Data Access Layer
 * (`src/server/auth/session.ts`) and run inside every page and server action.
 */
export const routeAccessRules: { prefix: string; roles: readonly Role[] }[] = [
  { prefix: "/super-admin", roles: ["SUPER_ADMIN"] },
  { prefix: "/admin", roles: ["GYM_ADMIN"] },
  { prefix: "/dashboard", roles: ["MEMBER"] },
  { prefix: "/nutrition", roles: ["MEMBER"] },
  { prefix: "/workouts", roles: ["MEMBER"] },
  { prefix: "/recovery", roles: ["MEMBER"] },
  { prefix: "/progress", roles: ["MEMBER"] },
  { prefix: "/analytics", roles: ["MEMBER"] },
  { prefix: "/profile", roles: ["MEMBER", "GYM_ADMIN", "SUPER_ADMIN"] },
]

export function findRouteRule(pathname: string) {
  return routeAccessRules.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/** Only allow same-origin relative paths as post-login redirect targets. */
export function safeCallbackPath(value: unknown) {
  if (typeof value !== "string") return null
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null
  }
  return value
}
