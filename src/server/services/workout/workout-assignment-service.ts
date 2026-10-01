import type mongoose from "mongoose"
import { Types } from "mongoose"

import { endAssignmentSchema, type EndAssignmentInput } from "@/lib/validations/nutrition"
import {
  assignMyWorkoutPlanSchema,
  assignWorkoutPlanSchema,
  calendarDateSchema,
  customizeMyWorkoutPlanSchema,
  objectIdSchema,
  type AssignMyWorkoutPlanInput,
  type AssignWorkoutPlanInput,
  type CustomizeMyWorkoutPlanInput,
} from "@/lib/validations/workout"
import { assertGymAdmin } from "@/server/auth/guards"
import { dbReady } from "@/server/db"
import { inTransaction } from "@/server/db/transaction"
import { DomainError, parseInput, ValidationError } from "@/server/errors"
import { WorkoutPlan } from "@/server/models/workout-plan"
import { WorkoutPlanAssignment } from "@/server/models/workout-plan-assignment"
import { scopeToGym } from "@/server/tenant"
import { gymMemberTarget, scopeToTarget, selfTarget, type MemberTarget } from "@/server/services/nutrition/member-target"
import { clonePlanForMember, loadWorkoutPlanDetail } from "@/server/services/workout/workout-plan-service"
import type { GymAdminUser, MemberUser } from "@/types/auth"
import type { WorkoutAssignmentView, WorkoutPlanDetail } from "@/types/workout"

/*
 * Workout assignments. Same rules as diet assignments:
 *  - Admins assign GYM plans only; members activate their OWN personal plans.
 *  - One ACTIVE assignment per member (partial unique index); replacing needs
 *    explicit `replaceActive` and happens in one transaction.
 *  - Calendar dates are always supplied by the caller (browser-local day).
 *  - Assignment ranges are never rewritten, so history stays correct.
 */

interface AssignmentRecord {
  _id: Types.ObjectId
  workoutPlanId: Types.ObjectId
  userId: Types.ObjectId
  startDate: string
  endDate?: string | null
  status: WorkoutAssignmentView["status"]
  assignedBy: Types.ObjectId
  createdAt: Date
}

async function toViews(gymId: string, records: AssignmentRecord[]): Promise<WorkoutAssignmentView[]> {
  const planIds = [...new Set(records.map((r) => r.workoutPlanId.toString()))]
  const plans = planIds.length
    ? await WorkoutPlan.find(scopeToGym({ gymId }, { _id: { $in: planIds } }))
        .select("name ownerUserId")
        .lean<{ _id: Types.ObjectId; name: string; ownerUserId?: Types.ObjectId | null }[]>()
    : []
  const planById = new Map(plans.map((p) => [p._id.toString(), p]))
  return records.map((r) => {
    const plan = planById.get(r.workoutPlanId.toString())
    return {
      id: r._id.toString(),
      workoutPlanId: r.workoutPlanId.toString(),
      workoutPlanName: plan?.name ?? "Unknown plan",
      workoutPlanKind: plan?.ownerUserId ? "PERSONAL" : "GYM",
      memberId: r.userId.toString(),
      startDate: r.startDate,
      endDate: r.endDate ?? null,
      status: r.status,
      assignedBy: r.assignedBy.toString(),
      createdAt: r.createdAt.toISOString(),
    }
  })
}

/** End the member's current ACTIVE assignment on `startDate`, only if the caller confirmed. */
async function endCurrentIfConfirmed(
  target: MemberTarget,
  startDate: string,
  replaceActive: boolean,
  session: mongoose.ClientSession
) {
  const current = await WorkoutPlanAssignment.findOne(scopeToTarget(target, { status: "ACTIVE" }))
    .select("startDate")
    .session(session)
    .lean<{ _id: Types.ObjectId; startDate: string }>()
  if (!current) return
  if (!replaceActive) throw new DomainError("ACTIVE_WORKOUT_ASSIGNMENT_EXISTS")
  if (startDate < current.startDate) {
    throw new ValidationError({
      startDate: [`Must be on or after the current plan's start date (${current.startDate})`],
    })
  }
  await WorkoutPlanAssignment.updateOne(scopeToTarget(target, { _id: current._id, status: "ACTIVE" }), {
    $set: { status: "COMPLETED", endDate: startDate },
  }).session(session)
}

async function createAssignment(
  target: MemberTarget,
  values: { workoutPlanId: string; startDate: string; endDate?: string | null; assignedBy: string },
  session: mongoose.ClientSession
) {
  const [assignment] = await WorkoutPlanAssignment.create(
    [
      {
        gymId: target.gymId,
        userId: target.memberId,
        workoutPlanId: values.workoutPlanId,
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

/** An ACTIVE plan of the given ownership (null = gym plan) in the target's gym, or the right error. */
async function requireAssignablePlan(
  target: MemberTarget,
  planId: string,
  ownerUserId: string | null,
  session: mongoose.ClientSession
) {
  const plan = await WorkoutPlan.findOne(
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
 * Gym Admin assigns one of their gym's ACTIVE **gym** plans to a member of
 * their gym, from the REQUIRED caller-supplied `startDate`. Members' personal
 * plans are "not found". An existing ACTIVE plan is rejected
 * (ACTIVE_WORKOUT_ASSIGNMENT_EXISTS) unless `replaceActive` is set; then it
 * is COMPLETED (endDate = startDate) in the same transaction.
 */
export async function assignWorkoutPlan(admin: GymAdminUser, input: AssignWorkoutPlanInput): Promise<{ id: string }> {
  assertGymAdmin(admin)
  const data = parseInput(assignWorkoutPlanSchema, input)
  const target = await gymMemberTarget(admin, data.memberId)
  const id = await inTransaction(async (session) => {
    await requireAssignablePlan(target, data.workoutPlanId, null, session)
    await endCurrentIfConfirmed(target, data.startDate, data.replaceActive, session)
    return createAssignment(target, { ...data, assignedBy: admin.id }, session)
  })
  return { id }
}

/** A member switches to one of their OWN personal plans (same one-active rule). */
export async function assignMyWorkoutPlan(member: MemberUser, input: AssignMyWorkoutPlanInput): Promise<{ id: string }> {
  const target = selfTarget(member)
  const data = parseInput(assignMyWorkoutPlanSchema, input)
  const id = await inTransaction(async (session) => {
    await requireAssignablePlan(target, data.workoutPlanId, member.id, session)
    await endCurrentIfConfirmed(target, data.startDate, data.replaceActive, session)
    return createAssignment(target, { ...data, assignedBy: member.id }, session)
  })
  return { id }
}

/**
 * "Customize my plan": the member's current ACTIVE plan is a gym plan → give
 * them a PERSONAL copy, end the gym assignment on `startDate` and start the
 * copy from that day, in one transaction. The gym plan is only read, so it
 * and every other member on it are unaffected. If the member already has an
 * ACTIVE personal copy of this gym plan it is reused rather than duplicated.
 * If the current plan is already the member's own, nothing happens.
 */
export async function customizeMyWorkoutPlan(
  member: MemberUser,
  input: CustomizeMyWorkoutPlanInput
): Promise<{ planId: string; copied: boolean }> {
  const target = selfTarget(member)
  const { startDate } = parseInput(customizeMyWorkoutPlanSchema, input)
  return inTransaction(async (session) => {
    const current = await WorkoutPlanAssignment.findOne(scopeToTarget(target, { status: "ACTIVE" }))
      .session(session)
      .lean<AssignmentRecord>()
    if (!current) throw new DomainError("NOT_FOUND")
    const plan = await WorkoutPlan.findOne(scopeToGym({ gymId: target.gymId }, { _id: current.workoutPlanId }))
      .select("ownerUserId")
      .session(session)
      .lean<{ ownerUserId?: Types.ObjectId | null }>()
    if (!plan) throw new DomainError("NOT_FOUND")
    if (plan.ownerUserId?.toString() === member.id) {
      return { planId: current.workoutPlanId.toString(), copied: false }
    }
    if (current.endDate && current.endDate < startDate) {
      throw new ValidationError({ startDate: [`Your current plan ended on ${current.endDate}`] })
    }

    const existingCopy = await WorkoutPlan.findOne(
      scopeToGym({ gymId: target.gymId }, {
        ownerUserId: new Types.ObjectId(member.id),
        sourcePlanId: current.workoutPlanId,
        status: "ACTIVE",
      })
    )
      .sort({ updatedAt: -1 })
      .select("_id")
      .session(session)
      .lean<{ _id: Types.ObjectId }>()
    const copied = !existingCopy
    const planId = existingCopy
      ? existingCopy._id.toString()
      : await clonePlanForMember({ gymId: target.gymId }, current.workoutPlanId.toString(), member.id, session)

    await endCurrentIfConfirmed(target, startDate, true, session)
    await createAssignment(target, { workoutPlanId: planId, startDate, endDate: current.endDate, assignedBy: member.id }, session)
    return { planId, copied }
  })
}

/**
 * End an ACTIVE assignment as COMPLETED or CANCELLED (admin's gym only) on
 * the required caller-supplied `endDate`. An earlier planned end is kept.
 */
export async function endWorkoutPlanAssignment(admin: GymAdminUser, assignmentId: string, input: EndAssignmentInput) {
  assertGymAdmin(admin)
  const id = parseInput(objectIdSchema, assignmentId)
  const { status, endDate: requestedEnd } = parseInput(endAssignmentSchema, input)
  await dbReady()
  const existing = await WorkoutPlanAssignment.findOne(scopeToGym(admin, { _id: id, status: "ACTIVE" }))
    .select("startDate endDate")
    .lean<{ startDate: string; endDate?: string | null }>()
  if (!existing) throw new DomainError("NOT_FOUND")
  if (status === "COMPLETED" && requestedEnd < existing.startDate) {
    throw new ValidationError({ endDate: ["End date can't be before the start date"] })
  }
  const endDate = existing.endDate && existing.endDate < requestedEnd ? existing.endDate : requestedEnd
  await WorkoutPlanAssignment.updateOne(scopeToGym(admin, { _id: id, status: "ACTIVE" }), {
    $set: { status, endDate },
  })
}

/** A member's assignment history (newest first). */
export async function listWorkoutPlanAssignments(target: MemberTarget): Promise<WorkoutAssignmentView[]> {
  await dbReady()
  const records = await WorkoutPlanAssignment.find(scopeToTarget(target))
    .sort({ startDate: -1, createdAt: -1 })
    .limit(100)
    .lean<AssignmentRecord[]>()
  return toViews(target.gymId, records)
}

/**
 * The plan that applies to the member on `date` (caller-supplied local day):
 * an assignment whose range [startDate, endDate ?? ∞] covers it. On a
 * hand-over day the newer assignment wins.
 */
export async function getWorkoutPlanForDate(
  target: MemberTarget,
  date: string
): Promise<{ assignment: WorkoutAssignmentView; plan: WorkoutPlanDetail } | null> {
  const day = parseInput(calendarDateSchema, date)
  await dbReady()
  const record = await WorkoutPlanAssignment.findOne(
    scopeToTarget(target, {
      startDate: { $lte: day },
      $or: [{ endDate: null }, { endDate: { $gte: day } }],
    })
  )
    .sort({ startDate: -1, createdAt: -1 })
    .lean<AssignmentRecord>()
  if (!record) return null
  const plan = await loadWorkoutPlanDetail({ gymId: target.gymId }, record.workoutPlanId.toString())
  if (!plan) return null
  const [assignment] = await toViews(target.gymId, [record])
  return { assignment, plan }
}

/** The member's ACTIVE assignment with the full plan, regardless of dates. */
export async function getActiveWorkoutPlan(
  target: MemberTarget
): Promise<{ assignment: WorkoutAssignmentView; plan: WorkoutPlanDetail } | null> {
  await dbReady()
  const record = await WorkoutPlanAssignment.findOne(scopeToTarget(target, { status: "ACTIVE" })).lean<AssignmentRecord>()
  if (!record) return null
  const plan = await loadWorkoutPlanDetail({ gymId: target.gymId }, record.workoutPlanId.toString())
  if (!plan) return null
  const [assignment] = await toViews(target.gymId, [record])
  return { assignment, plan }
}
