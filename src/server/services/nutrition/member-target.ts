import { objectIdSchema } from "@/lib/validations/nutrition"
import { assertGymAdmin, assertMember, assertSuperAdmin, ForbiddenError } from "@/server/auth/guards"
import { dbReady } from "@/server/db"
import { crossTenant } from "@/server/db/tenant-guard"
import { DomainError, parseInput } from "@/server/errors"
import { User } from "@/server/models/user"
import { scopeToGym, scopeToMember } from "@/server/tenant"
import type { GymAdminUser, MemberUser, SuperAdminUser } from "@/types/auth"

/**
 * "Whose nutrition data is this?" — resolved ONLY on the server.
 *
 * Member-owned nutrition services (goals, assignments, daily logs) accept a
 * `MemberTarget`, never a raw userId. A target can only be obtained through
 * the resolvers below, which encode the ownership rules:
 *
 *   MEMBER      → selfTarget: always themselves (any client userId is ignored)
 *   GYM_ADMIN   → gymMemberTarget: a MEMBER of their own gym, verified in DB
 *   SUPER_ADMIN → platformMemberTarget: any gym's member, READ-ONLY, crossTenant
 */

declare const memberTargetBrand: unique symbol

export interface MemberTarget {
  readonly gymId: string
  readonly memberId: string
  /** Super Admin targets are read-only. */
  readonly writable: boolean
  readonly [memberTargetBrand]: true
}

function makeTarget(gymId: string, memberId: string, writable: boolean): MemberTarget {
  return Object.freeze({ gymId, memberId, writable }) as MemberTarget
}

export function selfTarget(member: MemberUser): MemberTarget {
  assertMember(member)
  return makeTarget(member.gymId, member.id, true)
}

export async function gymMemberTarget(admin: GymAdminUser, memberId: string): Promise<MemberTarget> {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, memberId)
  await dbReady()
  const exists = await User.exists(scopeToGym(admin, { _id: id, role: "MEMBER" }))
  if (!exists) throw new DomainError("NOT_FOUND")
  return makeTarget(admin.gymId, id, true)
}

export async function platformMemberTarget(
  actor: SuperAdminUser,
  memberId: string
): Promise<MemberTarget> {
  assertSuperAdmin(actor)
  const id = parseInput(objectIdSchema, memberId)
  await dbReady()
  // Intentional platform-wide lookup: Super Admin may inspect any gym.
  const member = await crossTenant(User.findOne({ _id: id, role: "MEMBER" }))
    .select("gymId")
    .lean<{ gymId: { toString(): string } | null }>()
  if (!member?.gymId) throw new DomainError("NOT_FOUND")
  return makeTarget(member.gymId.toString(), id, false)
}

export function assertWritable(target: MemberTarget) {
  if (!target?.writable) throw new ForbiddenError("Read-only access")
}

/** `filter AND gymId = target.gymId AND userId = target.memberId`. */
export function scopeToTarget<F extends object>(target: MemberTarget, filter?: F) {
  return scopeToMember({ gymId: target.gymId, id: target.memberId }, filter)
}
