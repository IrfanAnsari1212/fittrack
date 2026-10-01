import type { ProfileInput } from "@/lib/validations/schemas"
import { dbReady } from "@/server/db"
import { DomainError } from "@/server/errors"
import { User } from "@/server/models/user"
import type { SessionUser } from "@/types/auth"

/**
 * Self-service profile. Scoped to the authenticated user's own id AND gym,
 * so there is no way to address another user's record from here.
 */
function selfFilter(user: SessionUser) {
  return { _id: user.id, gymId: user.gymId }
}

export async function getOwnProfile(user: SessionUser) {
  await dbReady()
  const profile = await User.findOne(selfFilter(user))
    .select("name email phone createdAt")
    .lean()
  if (!profile) throw new DomainError("NOT_FOUND")
  return {
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? null,
    createdAt: profile.createdAt.toISOString(),
  }
}

export async function updateOwnProfile(user: SessionUser, input: ProfileInput) {
  await dbReady()
  const result = await User.updateOne(
    selfFilter(user),
    { $set: { name: input.name, phone: input.phone } },
    { runValidators: true }
  )
  if (result.matchedCount === 0) throw new DomainError("NOT_FOUND")
}
