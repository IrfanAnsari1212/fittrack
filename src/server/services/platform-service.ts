import type { Types } from "mongoose"

import type { Role, UserStatus } from "@/lib/auth/roles"
import { assertSuperAdmin } from "@/server/auth/guards"
import { dbReady } from "@/server/db"
import { crossTenant } from "@/server/db/tenant-guard"
import { Gym } from "@/server/models/gym"
import { User } from "@/server/models/user"
import type { PlatformGymRow, PlatformStats, PlatformUserRow } from "@/types/admin"
import type { SuperAdminUser } from "@/types/auth"

/**
 * Super Admin reporting. These are the only intentionally cross-tenant
 * reads in the app, and each one is marked with `crossTenant()`.
 * The `SuperAdminUser` parameter forces callers through `requireSuperAdmin()`.
 */

export async function getPlatformStats(actor: SuperAdminUser): Promise<PlatformStats> {
  assertSuperAdmin(actor)
  await dbReady()
  const [gyms, activeGyms, gymAdmins, members] = await Promise.all([
    Gym.countDocuments({}),
    Gym.countDocuments({ status: "ACTIVE" }),
    crossTenant(User.countDocuments({ role: "GYM_ADMIN" })),
    crossTenant(User.countDocuments({ role: "MEMBER" })),
  ])
  return { gyms, activeGyms, gymAdmins, members }
}

export async function listGyms(actor: SuperAdminUser): Promise<PlatformGymRow[]> {
  assertSuperAdmin(actor)
  await dbReady()
  const gyms = await Gym.find({}).sort({ createdAt: -1 }).lean()

  // Not `populate()`: its internal User query can't be marked crossTenant
  // and is (correctly) rejected by the tenant guard.
  const owners = await crossTenant(User.find({ _id: { $in: gyms.map((g) => g.ownerId) } }))
    .select("name email")
    .lean<{ _id: Types.ObjectId; name: string; email: string }[]>()
  const ownerById = new Map(owners.map((o) => [o._id.toString(), o]))

  const counts = await User.aggregate<{ _id: { gymId: Types.ObjectId; role: Role }; count: number }>([
    { $match: { gymId: { $ne: null } } },
    { $group: { _id: { gymId: "$gymId", role: "$role" }, count: { $sum: 1 } } },
  ])
  const countFor = (gymId: string, role: Role) =>
    counts.find((c) => c._id.gymId.toString() === gymId && c._id.role === role)?.count ?? 0

  return gyms.map((gym) => {
    const id = gym._id.toString()
    return {
      id,
      name: gym.name,
      slug: gym.slug,
      status: gym.status,
      plan: gym.subscription?.plan ?? "TRIAL",
      subscriptionStatus: gym.subscription?.status ?? "TRIALING",
      createdAt: gym.createdAt.toISOString(),
      ownerName: ownerById.get(gym.ownerId.toString())?.name ?? null,
      ownerEmail: ownerById.get(gym.ownerId.toString())?.email ?? null,
      memberCount: countFor(id, "MEMBER"),
      adminCount: countFor(id, "GYM_ADMIN"),
    }
  })
}

export async function listAllUsers(actor: SuperAdminUser): Promise<PlatformUserRow[]> {
  assertSuperAdmin(actor)
  await dbReady()
  const users = await crossTenant(User.find({}))
    .select("name email role status gymId createdAt")
    .sort({ createdAt: -1 })
    .limit(500)
    .populate<{ gymId: { name: string } | null }>("gymId", "name")
    .lean<
      {
        _id: Types.ObjectId
        name: string
        email: string
        role: Role
        status: UserStatus
        gymId: { name: string } | null
        createdAt: Date
      }[]
    >()

  return users.map((user) => ({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    gymName: user.gymId?.name ?? null,
    createdAt: user.createdAt.toISOString(),
  }))
}
