import mongoose, { Types } from "mongoose"

import {
  assignDietPlanSchema,
  assignMyDietPlanSchema,
  calendarDateSchema,
  customizeMyDietPlanSchema,
  endAssignmentSchema,
  objectIdSchema,
  type AssignDietPlanInput,
  type AssignMyDietPlanInput,
  type CustomizeMyDietPlanInput,
  type EndAssignmentInput,
} from "@/lib/validations/nutrition"
import { assertGymAdmin } from "@/server/auth/guards"
import { dbReady } from "@/server/db"
import { DomainError, isDuplicateKeyError, parseInput, ValidationError } from "@/server/errors"
import { DietPlan } from "@/server/models/diet-plan"
import { DietPlanAssignment } from "@/server/models/diet-plan-assignment"
import { scopeToGym } from "@/server/tenant"
import { clonePlanForMember, loadDietPlanDetail } from "@/server/services/nutrition/diet-plan-service"
import { gymMemberTarget, scopeToTarget, selfTarget, type MemberTarget } from "@/server/services/nutrition/member-target"
import type { GymAdminUser, MemberUser } from "@/types/auth"
import type { DietPlanAssignmentView, DietPlanDetail } from "@/types/nutrition"

interface AssignmentRecord {
  _id: Types.ObjectId
  dietPlanId: Types.ObjectId
  userId: Types.ObjectId
  startDate: string
  endDate?: string | null
  status: DietPlanAssignmentView["status"]
  assignedBy: Types.ObjectId
  createdAt: Date
}

async function toViews(gymId: string, records: AssignmentRecord[]): Promise<DietPlanAssignmentView[]> {
  const planIds = [...new Set(records.map((r) => r.dietPlanId.toString()))]
  const plans = planIds.length
    ? await DietPlan.find(scopeToGym({ gymId }, { _id: { $in: planIds } }))
        .select("name ownerUserId")
        .lean<{ _id: Types.ObjectId; name: string; ownerUserId?: Types.ObjectId | null }[]>()
    : []
  const planById = new Map(plans.map((p) => [p._id.toString(), p]))
  return records.map((r) => {
    const plan = planById.get(r.dietPlanId.toString())
    return {
      id: r._id.toString(),
      dietPlanId: r.dietPlanId.toString(),
      dietPlanName: plan?.name ?? "Unknown plan",
      dietPlanKind: plan?.ownerUserId ? "PERSONAL" : "GYM",
      memberId: r.userId.toString(),
      startDate: r.startDate,
      endDate: r.endDate ?? null,
      status: r.status,
      assignedBy: r.assignedBy.toString(),
      createdAt: r.createdAt.toISOString(),
    }
  })
}

/**
 * Inside a transaction: end the member's current ACTIVE assignment on
 * `startDate` — but only if the caller explicitly confirmed (`replaceActive`).
 * Never silently overwrites. The new plan can't start before the old one.
 */
async function endCurrentIfConfirmed(
  target: MemberTarget,
  startDate: string,
  replaceActive: boolean,
  session: mongoose.ClientSession
) {
  const current = await DietPlanAssignment.findOne(scopeToTarget(target, { status: "ACTIVE" }))
    .select("startDate")
    .session(session)
    .lean<{ _id: Types.ObjectId; startDate: string }>()
  if (!current) return
  if (!replaceActive) throw new DomainError("ACTIVE_ASSIGNMENT_EXISTS")
  if (startDate < current.startDate) {
    throw new ValidationError({
      startDate: [`Must be on or after the current plan's start date (${current.startDate})`],
    })
  }
  await DietPlanAssignment.updateOne(
    scopeToTarget(target, { _id: current._id, status: "ACTIVE" }),
    { $set: { status: "COMPLETED", endDate: startDate } }
  ).session(session)
}

async function createAssignment(
  target: MemberTarget,
  values: { dietPlanId: string; startDate: string; endDate?: string | null; assignedBy: string },
  session: mongoose.ClientSession
) {
  const [assignment] = await DietPlanAssignment.create(
    [
      {
        gymId: target.gymId,
        userId: target.memberId,
        dietPlanId: values.dietPlanId,
        startDate: values.startDate,
        endDate: values.endDate ?? null,
        status: "ACTIVE",
        assignedBy: values.assignedBy,
      },
    ],
    { session }
  )
  return assignment._id.toString()
}

async function inTransaction<T>(work: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  await dbReady()
  const session = await mongoose.startSession()
  try {
    let result: T
    await session.withTransaction(async () => {
      result = await work(session)
    })
    return result!
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new DomainError("CONFLICT")
    throw error
  } finally {
    await session.endSession()
  }
}

/** An ACTIVE plan matching `filter` (gym-scoped), or the right error. */
async function requireAssignablePlan(
  target: MemberTarget,
  planId: string,
  ownerUserId: string | null,
  session: mongoose.ClientSession
) {
  const plan = await DietPlan.findOne(
    scopeToGym({ gymId: target.gymId }, {
      _id: planId,
      ownerUserId: ownerUserId ? new Types.ObjectId(ownerUserId) : null,
    })
  )
    .select("status")
    .session(session)
    .lean<{ status: string }>()
  if (!plan) throw new DomainError("NOT_FOUND")
  if (plan.status !== "ACTIVE") throw new DomainError("PLAN_ARCHIVED")
}

/**
 * Gym Admin assigns one of their gym's ACTIVE **gym** plans to one of their
 * gym's members, starting on the REQUIRED caller-supplied `startDate`
 * ("YYYY-MM-DD" in the gym/member timezone — never the server's UTC clock).
 * Members' personal plans can't be assigned to anyone else ("not found").
 * If the member already has an ACTIVE plan the call is rejected
 * (ACTIVE_ASSIGNMENT_EXISTS) unless `replaceActive` is set; then the old one
 * is COMPLETED with the new startDate as its endDate, in the same transaction.
 * At most one ACTIVE plan per member is also enforced by a partial unique index.
 */
export async function assignDietPlan(
  admin: GymAdminUser,
  input: AssignDietPlanInput
): Promise<{ id: string }> {
  assertGymAdmin(admin)
  const data = parseInput(assignDietPlanSchema, input)
  const target = await gymMemberTarget(admin, data.memberId)
  const id = await inTransaction(async (session) => {
    await requireAssignablePlan(target, data.dietPlanId, null, session)
    await endCurrentIfConfirmed(target, data.startDate, data.replaceActive, session)
    return createAssignment(target, { ...data, assignedBy: admin.id }, session)
  })
  return { id }
}

/**
 * A member switches to one of their OWN personal plans (same one-active and
 * explicit-replace rules). Gym plans and other members' plans are "not found".
 */
export async function assignMyDietPlan(
  member: MemberUser,
  input: AssignMyDietPlanInput
): Promise<{ id: string }> {
  const target = selfTarget(member)
  const data = parseInput(assignMyDietPlanSchema, input)
  const id = await inTransaction(async (session) => {
    await requireAssignablePlan(target, data.dietPlanId, member.id, session)
    await endCurrentIfConfirmed(target, data.startDate, data.replaceActive, session)
    return createAssignment(target, { ...data, assignedBy: member.id }, session)
  })
  return { id }
}

/**
 * "Customize my plan": the member's current ACTIVE plan is a gym plan → copy
 * it into a PERSONAL plan, end the gym assignment on `startDate` and assign
 * the copy from that day — all in one transaction. The gym plan is only read,
 * so it and every other member assigned to it are unaffected. Earlier days
 * keep resolving to the gym plan (the assignment ranges are preserved).
 * If the current plan is already the member's own, nothing is copied.
 */
export async function customizeMyDietPlan(
  member: MemberUser,
  input: CustomizeMyDietPlanInput
): Promise<{ planId: string; copied: boolean }> {
  const target = selfTarget(member)
  const { startDate } = parseInput(customizeMyDietPlanSchema, input)
  return inTransaction(async (session) => {
    const current = await DietPlanAssignment.findOne(scopeToTarget(target, { status: "ACTIVE" }))
      .session(session)
      .lean<AssignmentRecord>()
    if (!current) throw new DomainError("NOT_FOUND")
    const plan = await DietPlan.findOne(scopeToGym({ gymId: target.gymId }, { _id: current.dietPlanId }))
      .select("ownerUserId")
      .session(session)
      .lean<{ ownerUserId?: Types.ObjectId | null }>()
    if (!plan) throw new DomainError("NOT_FOUND")
    if (plan.ownerUserId?.toString() === member.id) {
      return { planId: current.dietPlanId.toString(), copied: false }
    }
    if (current.endDate && current.endDate < startDate) {
      throw new ValidationError({ startDate: [`Your current plan ended on ${current.endDate}`] })
    }

    const planId = await clonePlanForMember({ gymId: target.gymId }, current.dietPlanId.toString(), member.id, session)
    await endCurrentIfConfirmed(target, startDate, true, session)
    await createAssignment(target, { dietPlanId: planId, startDate, endDate: current.endDate, assignedBy: member.id }, session)
    return { planId, copied: true }
  })
}

/**
 * End an ACTIVE assignment as COMPLETED or CANCELLED (admin's gym only).
 * `input.endDate` is required: the admin's "today" in the gym timezone.
 * An earlier planned end date already on the assignment is kept.
 */
export async function endDietPlanAssignment(
  admin: GymAdminUser,
  assignmentId: string,
  input: EndAssignmentInput
) {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, assignmentId)
  const { status, endDate: requestedEnd } = parseInput(endAssignmentSchema, input)
  await dbReady()
  const existing = await DietPlanAssignment.findOne(scopeToGym(admin, { _id: id, status: "ACTIVE" }))
    .select("startDate endDate")
    .lean<{ startDate: string; endDate?: string | null }>()
  if (!existing) throw new DomainError("NOT_FOUND")
  // A plan can only be COMPLETED after it started. CANCELLED before its start
  // date is allowed: it simply never took effect (it then covers no day).
  if (status === "COMPLETED" && requestedEnd < existing.startDate) {
    throw new ValidationError({ endDate: ["End date can't be before the start date"] })
  }
  const endDate = existing.endDate && existing.endDate < requestedEnd ? existing.endDate : requestedEnd
  await DietPlanAssignment.updateOne(scopeToGym(admin, { _id: id, status: "ACTIVE" }), {
    $set: { status, endDate },
  })
}

/** A member's assignment history (newest first). */
export async function listDietPlanAssignments(target: MemberTarget): Promise<DietPlanAssignmentView[]> {
  await dbReady()
  const records = await DietPlanAssignment.find(scopeToTarget(target))
    .sort({ startDate: -1, createdAt: -1 })
    .limit(100)
    .lean<AssignmentRecord[]>()
  return toViews(target.gymId, records)
}

/**
 * The plan that applies to the member on `date` ("YYYY-MM-DD", supplied by
 * the caller in the member's timezone): an assignment whose range
 * [startDate, endDate ?? ∞] covers the date. ACTIVE and COMPLETED
 * assignments count (so past days show the plan that applied then);
 * a plan cancelled before it started covers no day. On a hand-over day
 * (old plan ends, new one starts) the newer assignment wins.
 */
export async function getDietPlanForDate(
  target: MemberTarget,
  date: string
): Promise<{ assignment: DietPlanAssignmentView; plan: DietPlanDetail } | null> {
  const day = parseInput(calendarDateSchema, date)
  await dbReady()
  const record = await DietPlanAssignment.findOne(
    scopeToTarget(target, {
      startDate: { $lte: day },
      $or: [{ endDate: null }, { endDate: { $gte: day } }],
    })
  )
    .sort({ startDate: -1, createdAt: -1 })
    .lean<AssignmentRecord>()
  if (!record) return null
  const plan = await loadDietPlanDetail({ gymId: target.gymId }, record.dietPlanId.toString())
  if (!plan) return null
  const [assignment] = await toViews(target.gymId, [record])
  return { assignment, plan }
}

/**
 * The member's ACTIVE assignment with the full plan, regardless of dates
 * (admin views). For "the plan for today" use `getDietPlanForDate`. This is how a MEMBER
 * reads a diet plan: only through their own assignment, never by plan id.
 */
export async function getActiveDietPlan(
  target: MemberTarget
): Promise<{ assignment: DietPlanAssignmentView; plan: DietPlanDetail } | null> {
  await dbReady()
  const record = await DietPlanAssignment.findOne(scopeToTarget(target, { status: "ACTIVE" })).lean<AssignmentRecord>()
  if (!record) return null
  const plan = await loadDietPlanDetail({ gymId: target.gymId }, record.dietPlanId.toString())
  if (!plan) return null
  const [assignment] = await toViews(target.gymId, [record])
  return { assignment, plan }
}
