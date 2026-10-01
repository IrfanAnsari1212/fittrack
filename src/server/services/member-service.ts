import type { Types } from "mongoose"

import type { UserStatus } from "@/lib/auth/roles"
import type { CreateMemberInput, UpdateMemberInput } from "@/lib/validations/schemas"
import { assertGymAdmin } from "@/server/auth/guards"
import { dbReady } from "@/server/db"
import { DomainError, isDuplicateKeyError } from "@/server/errors"
import { hashPassword } from "@/server/auth/password"
import { User } from "@/server/models/user"
import { isValidId, scopeToGym } from "@/server/tenant"
import type { MemberDetail, MemberSummary } from "@/types/admin"
import type { GymAdminUser } from "@/types/auth"

/**
 * Gym Admin → member management. Every query is scoped with
 * `scopeToGym(admin, …)`, so an admin can only ever see or change members of
 * their own gym, whatever ids or fields the client sends.
 */

interface MemberRecord {
  _id: Types.ObjectId
  name: string
  email: string
  phone?: string | null
  status: UserStatus
  dateOfBirth?: Date | null
  notes?: string | null
  createdAt: Date
  updatedAt: Date
}

const MEMBER_FIELDS = "name email phone status dateOfBirth notes createdAt updatedAt"

function toSummary(user: MemberRecord): MemberSummary {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export async function listMembers(
  admin: GymAdminUser,
  { query }: { query?: string } = {}
): Promise<MemberSummary[]> {
  assertGymAdmin(admin)
  await dbReady()
  const search = query?.trim().slice(0, 100)
  const filter = search
    ? {
        role: "MEMBER",
        $or: [
          { name: new RegExp(escapeRegex(search), "i") },
          { email: new RegExp(escapeRegex(search), "i") },
        ],
      }
    : { role: "MEMBER" }

  const members = await User.find(scopeToGym(admin, filter))
    .select(MEMBER_FIELDS)
    .sort({ createdAt: -1 })
    .limit(500)
    .lean<MemberRecord[]>()
  return members.map(toSummary)
}

/** Returns null both for "doesn't exist" and "belongs to another gym". */
export async function getMember(
  admin: GymAdminUser,
  memberId: string
): Promise<MemberDetail | null> {
  if (!isValidId(memberId)) return null
  assertGymAdmin(admin)
  await dbReady()
  const member = await User.findOne(scopeToGym(admin, { _id: memberId, role: "MEMBER" }))
    .select(MEMBER_FIELDS)
    .lean<MemberRecord>()
  if (!member) return null
  return {
    ...toSummary(member),
    dateOfBirth: member.dateOfBirth ? member.dateOfBirth.toISOString().slice(0, 10) : null,
    notes: member.notes ?? null,
    gymName: admin.gymName,
    updatedAt: member.updatedAt.toISOString(),
  }
}

export async function createMember(
  admin: GymAdminUser,
  input: CreateMemberInput
): Promise<{ id: string }> {
  assertGymAdmin(admin)
  await dbReady()
  const passwordHash = await hashPassword(input.password)
  try {
    // Fields are listed explicitly: gymId always comes from the admin's
    // session, never from `input`, even if a caller smuggles one in.
    const member = await User.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
      notes: input.notes,
      passwordHash,
      role: "MEMBER",
      status: "ACTIVE",
      gymId: admin.gymId,
    })
    return { id: member._id.toString() }
  } catch (error) {
    if (isDuplicateKeyError(error, "email")) throw new DomainError("EMAIL_TAKEN")
    throw error
  }
}

export async function updateMember(
  admin: GymAdminUser,
  memberId: string,
  input: UpdateMemberInput
): Promise<void> {
  if (!isValidId(memberId)) throw new DomainError("NOT_FOUND")
  assertGymAdmin(admin)
  await dbReady()
  try {
    const updated = await User.findOneAndUpdate(
      scopeToGym(admin, { _id: memberId, role: "MEMBER" }),
      {
        $set: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          dateOfBirth: input.dateOfBirth,
          notes: input.notes,
        },
      },
      { runValidators: true }
    ).lean()
    if (!updated) throw new DomainError("NOT_FOUND")
  } catch (error) {
    if (isDuplicateKeyError(error, "email")) throw new DomainError("EMAIL_TAKEN")
    throw error
  }
}

export async function setMemberStatus(
  admin: GymAdminUser,
  memberId: string,
  status: UserStatus
): Promise<void> {
  if (!isValidId(memberId)) throw new DomainError("NOT_FOUND")
  assertGymAdmin(admin)
  await dbReady()
  const result = await User.updateOne(
    scopeToGym(admin, { _id: memberId, role: "MEMBER" }),
    { $set: { status } }
  )
  if (result.matchedCount === 0) throw new DomainError("NOT_FOUND")
}

export async function getMemberStats(admin: GymAdminUser) {
  assertGymAdmin(admin)
  await dbReady()
  const [totalMembers, activeMembers] = await Promise.all([
    User.countDocuments(scopeToGym(admin, { role: "MEMBER" })),
    User.countDocuments(scopeToGym(admin, { role: "MEMBER", status: "ACTIVE" })),
  ])
  return { totalMembers, activeMembers, disabledMembers: totalMembers - activeMembers }
}
