import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import type { Role } from "@/lib/auth/roles"
import { loadSessionUser } from "@/server/auth/account"
import type {
  GymAdminUser,
  GymUser,
  MemberUser,
  SessionUser,
  SuperAdminUser,
} from "@/types/auth"

/**
 * Data Access Layer: the ONLY way pages and server actions obtain the
 * current user. Call one of the `require*` helpers at the top of every page
 * and every server action — layouts alone are not enough, because they don't
 * re-run on client-side navigation and don't cover server actions.
 *
 * The session cookie only proves identity; role, gym and status are always
 * re-read from the database (once per request, via `cache`).
 */

type AuthState =
  | { status: "anonymous" }
  | { status: "inactive" }
  | { status: "active"; user: SessionUser }

const getAuthState = cache(async (): Promise<AuthState> => {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { status: "anonymous" }

  const result = await loadSessionUser(userId)
  if (result.ok) return { status: "active", user: result.user }
  return result.reason === "inactive" ? { status: "inactive" } : { status: "anonymous" }
})

/** Current user, or null. Never throws or redirects. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const state = await getAuthState()
  return state.status === "active" ? state.user : null
}

export async function requireAuth(): Promise<SessionUser> {
  const state = await getAuthState()
  if (state.status === "active") return state.user
  redirect(state.status === "inactive" ? "/login?error=account_unavailable" : "/login")
}

export async function requireRole<R extends Role>(
  ...roles: R[]
): Promise<SessionUser & { role: R }> {
  const user = await requireAuth()
  if (!(roles as Role[]).includes(user.role)) redirect("/forbidden")
  return user as SessionUser & { role: R }
}

export async function requireSuperAdmin(): Promise<SuperAdminUser> {
  return (await requireRole("SUPER_ADMIN")) as SuperAdminUser
}

export async function requireGymAdmin(): Promise<GymAdminUser> {
  const user = await requireRole("GYM_ADMIN")
  if (!user.gymId) redirect("/forbidden")
  return user as GymAdminUser
}

export async function requireMember(): Promise<MemberUser> {
  const user = await requireRole("MEMBER")
  if (!user.gymId) redirect("/forbidden")
  return user as MemberUser
}

/**
 * For routes addressing a specific gym by id: allows that gym's own users
 * and Super Admins. Gym users can never pass another gym's id.
 */
export async function requireGymAccess(gymId: string): Promise<SessionUser> {
  const user = await requireAuth()
  if (user.role === "SUPER_ADMIN") return user
  if (user.gymId !== gymId) redirect("/forbidden")
  return user as GymUser
}

/** A GYM_ADMIN or MEMBER (anyone who belongs to a gym). */
export async function requireGymUser(): Promise<GymUser> {
  const user = await requireRole("GYM_ADMIN", "MEMBER")
  if (!user.gymId) redirect("/forbidden")
  return user as GymUser
}
