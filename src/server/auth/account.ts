import type { Types } from "mongoose"

import type { Role } from "@/lib/auth/roles"
import { dbReady } from "@/server/db"
import { crossTenant } from "@/server/db/tenant-guard"
import { burnPasswordCheck, verifyPassword } from "@/server/auth/password"
import { Gym } from "@/server/models/gym"
import { User } from "@/server/models/user"
import { isValidId } from "@/server/tenant"
import type { SessionUser } from "@/types/auth"

/**
 * Account loading shared by login (`verifyCredentials`) and every request
 * (`loadSessionUser`). No Next.js imports here, so it is usable from
 * scripts and tests.
 */

export type AccountResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "invalid" | "inactive" }

interface AccountRecord {
  _id: Types.ObjectId
  name: string
  email: string
  image?: string | null
  role: Role
  gymId?: Types.ObjectId | null
  status: string
}

/** Checks user + gym status and builds the safe session view. */
async function toActiveSessionUser(user: AccountRecord): Promise<AccountResult> {
  if (user.status !== "ACTIVE") return { ok: false, reason: "inactive" }

  let gymName: string | null = null
  if (user.role !== "SUPER_ADMIN") {
    if (!user.gymId) return { ok: false, reason: "inactive" }
    const gym = await Gym.findOne({ _id: user.gymId }).select("name status").lean()
    if (!gym || gym.status !== "ACTIVE") return { ok: false, reason: "inactive" }
    gymName = gym.name
  }

  return {
    ok: true,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      role: user.role,
      gymId: user.gymId ? user.gymId.toString() : null,
      gymName,
    },
  }
}

export async function verifyCredentials(
  email: string,
  password: string
): Promise<AccountResult> {
  await dbReady()
  // Login is the one place we look a user up before knowing their gym.
  const user = await crossTenant(
    User.findOne({ email: email.trim().toLowerCase() })
  )
    .select("+passwordHash")
    .lean<AccountRecord & { passwordHash: string }>()

  if (!user) {
    await burnPasswordCheck(password)
    return { ok: false, reason: "invalid" }
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, reason: "invalid" }
  }
  return toActiveSessionUser(user)
}

/** Used right after a successful sign-in to pick the landing page. */
export async function findRoleByEmail(email: string): Promise<Role | null> {
  await dbReady()
  const user = await crossTenant(User.findOne({ email: email.trim().toLowerCase() }))
    .select("role")
    .lean<{ role: Role }>()
  return user?.role ?? null
}

/** Reload the session's user from the DB so disables/role changes apply immediately. */
export async function loadSessionUser(userId: string): Promise<AccountResult> {
  if (!isValidId(userId)) return { ok: false, reason: "invalid" }
  await dbReady()
  // Identity lookup by primary key from the signed session token.
  const user = await crossTenant(User.findOne({ _id: userId })).lean<AccountRecord>()
  if (!user) return { ok: false, reason: "invalid" }
  return toActiveSessionUser(user)
}
