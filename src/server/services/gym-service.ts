import mongoose, { Types } from "mongoose"

import type { CreateGymInput, GymSettingsInput } from "@/lib/validations/schemas"
import { assertGymAdmin, assertSuperAdmin } from "@/server/auth/guards"
import { dbReady } from "@/server/db"
import { DomainError, isDuplicateKeyError } from "@/server/errors"
import { hashPassword } from "@/server/auth/password"
import { Gym } from "@/server/models/gym"
import { User } from "@/server/models/user"
import type { GymOverview } from "@/types/admin"
import type { GymAdminUser, SuperAdminUser } from "@/types/auth"

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "gym"
  )
}

async function uniqueSlug(name: string, session: mongoose.ClientSession) {
  const base = slugify(name)
  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    const exists = await Gym.exists({ slug }).session(session)
    if (!exists) return slug
  }
  return `${base}-${new Types.ObjectId().toString().slice(-6)}`
}

/**
 * Super Admin: create a gym and its primary Gym Admin atomically.
 * Runs in a transaction, so either both documents exist (and point at each
 * other) or neither does. Requires a replica set (Atlas or `npm run db:dev`).
 */
export async function createGymWithAdmin(
  actor: SuperAdminUser,
  input: CreateGymInput
): Promise<{ gymId: string; adminId: string }> {
  assertSuperAdmin(actor)
  await dbReady()
  // Hash before opening the transaction: bcrypt is slow on purpose.
  const passwordHash = await hashPassword(input.adminPassword)
  const gymId = new Types.ObjectId()
  const adminId = new Types.ObjectId()

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const slug = await uniqueSlug(input.gymName, session)
      await Gym.create(
        [
          {
            _id: gymId,
            name: input.gymName,
            slug,
            ownerId: adminId,
            status: "ACTIVE",
            subscription: { plan: "TRIAL", status: "TRIALING" },
          },
        ],
        { session }
      )
      await User.create(
        [
          {
            _id: adminId,
            name: input.adminName,
            email: input.adminEmail,
            passwordHash,
            role: "GYM_ADMIN",
            status: "ACTIVE",
            gymId,
          },
        ],
        { session }
      )
    })
    return { gymId: gymId.toString(), adminId: adminId.toString() }
  } catch (error) {
    if (isDuplicateKeyError(error, "email")) throw new DomainError("EMAIL_TAKEN")
    throw error
  } finally {
    await session.endSession()
  }
}

function toOverview(gym: {
  _id: Types.ObjectId
  name: string
  slug: string
  status: GymOverview["status"]
  subscription?: { plan?: string; status?: string } | null
  createdAt: Date
}): GymOverview {
  return {
    id: gym._id.toString(),
    name: gym.name,
    slug: gym.slug,
    status: gym.status,
    plan: gym.subscription?.plan ?? "TRIAL",
    subscriptionStatus: gym.subscription?.status ?? "TRIALING",
    createdAt: gym.createdAt.toISOString(),
  }
}

/** Gym Admin: their own gym only (scoped by the session's gymId). */
export async function getOwnGym(admin: GymAdminUser): Promise<GymOverview> {
  assertGymAdmin(admin)
  await dbReady()
  const gym = await Gym.findOne({ _id: admin.gymId }).lean()
  if (!gym) throw new DomainError("NOT_FOUND")
  return toOverview(gym)
}

export async function updateOwnGym(
  admin: GymAdminUser,
  input: GymSettingsInput
): Promise<void> {
  assertGymAdmin(admin)
  await dbReady()
  const result = await Gym.updateOne(
    { _id: admin.gymId },
    { $set: { name: input.name } },
    { runValidators: true }
  )
  if (result.matchedCount === 0) throw new DomainError("NOT_FOUND")
}
