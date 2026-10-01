import mongoose, { type Types } from "mongoose"

import {
  assignDietPlanSchema,
  endAssignmentSchema,
  objectIdSchema,
  type AssignDietPlanInput,
  type EndAssignmentInput,
} from "@/lib/validations/nutrition"
import { assertGymAdmin } from "@/server/auth/guards"
import { dbReady } from "@/server/db"
import { DomainError, isDuplicateKeyError, parseInput, ValidationError } from "@/server/errors"
import { DietPlan } from "@/server/models/diet-plan"
import { DietPlanAssignment } from "@/server/models/diet-plan-assignment"
import { scopeToGym } from "@/server/tenant"
import { loadDietPlanDetail } from "@/server/services/nutrition/diet-plan-service"
import { gymMemberTarget, scopeToTarget, type MemberTarget } from "@/server/services/nutrition/member-target"
import type { GymAdminUser } from "@/types/auth"
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
        .select("name")
        .lean<{ _id: Types.ObjectId; name: string }[]>()
    : []
  const nameById = new Map(plans.map((p) => [p._id.toString(), p.name]))
  return records.map((r) => ({
    id: r._id.toString(),
    dietPlanId: r.dietPlanId.toString(),
    dietPlanName: nameById.get(r.dietPlanId.toString()) ?? "Unknown plan",
    memberId: r.userId.toString(),
    startDate: r.startDate,
    endDate: r.endDate ?? null,
    status: r.status,
    assignedBy: r.assignedBy.toString(),
    createdAt: r.createdAt.toISOString(),
  }))
}

/**
 * Gym Admin assigns one of their gym's ACTIVE plans to one of their gym's
 * members, starting on the REQUIRED caller-supplied `startDate`
 * ("YYYY-MM-DD" in the gym/member timezone — never the server's UTC clock).
 * The previous ACTIVE assignment gets that same day as its endDate.
 * The plan and member are both looked up inside the admin's gym, so
 * a plan or member id from another gym is simply "not found". Any current
 * ACTIVE assignment is completed in the same transaction (one active plan
 * per member, also enforced by a partial unique index).
 */
export async function assignDietPlan(
  admin: GymAdminUser,
  input: AssignDietPlanInput
): Promise<{ id: string }> {
  assertGymAdmin(admin)
  const data = parseInput(assignDietPlanSchema, input)
  const target = await gymMemberTarget(admin, data.memberId)
  // Supplied by the caller in the gym/member timezone; never the server clock.
  const { startDate } = data

  const session = await mongoose.startSession()
  try {
    let id = ""
    await session.withTransaction(async () => {
      const plan = await DietPlan.findOne(scopeToGym(admin, { _id: data.dietPlanId }))
        .select("status")
        .session(session)
        .lean<{ status: string }>()
      if (!plan) throw new DomainError("NOT_FOUND")
      if (plan.status !== "ACTIVE") throw new DomainError("PLAN_ARCHIVED")

      await DietPlanAssignment.updateMany(
        scopeToTarget(target, { status: "ACTIVE" }),
        { $set: { status: "COMPLETED", endDate: startDate } }
      ).session(session)

      const [assignment] = await DietPlanAssignment.create(
        [
          {
            gymId: admin.gymId,
            userId: target.memberId,
            dietPlanId: data.dietPlanId,
            startDate,
            endDate: data.endDate ?? null,
            status: "ACTIVE",
            assignedBy: admin.id,
          },
        ],
        { session }
      )
      id = assignment._id.toString()
    })
    return { id }
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new DomainError("CONFLICT")
    throw error
  } finally {
    await session.endSession()
  }
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
  if (requestedEnd < existing.startDate) {
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
 * The member's ACTIVE assignment with the full plan. This is how a MEMBER
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
