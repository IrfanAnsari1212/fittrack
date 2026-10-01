/**
 * Module 4: workouts — exercise library, gym/personal workout plans,
 * assignments, customize-as-copy, actual sessions/sets, history, dates and
 * tenant/ownership security. Runs against an in-memory MongoDB replica set.
 */
import assert from "node:assert/strict"
import { after, before, describe, mock, test } from "node:test"

import { MongoMemoryReplSet } from "mongodb-memory-server"

import { loadSessionUser } from "@/server/auth/account"
import { ForbiddenError } from "@/server/auth/guards"
import { disconnectFromDatabase } from "@/server/db/connect"
import { crossTenant } from "@/server/db/tenant-guard"
import { DomainError, ValidationError } from "@/server/errors"
import { ExerciseSession } from "@/server/models/exercise-session"
import { SetLog } from "@/server/models/set-log"
import { User } from "@/server/models/user"
import { WorkoutPlan } from "@/server/models/workout-plan"
import { WorkoutPlanAssignment } from "@/server/models/workout-plan-assignment"
import { WorkoutPlanDay } from "@/server/models/workout-plan-day"
import { WorkoutPlanExercise } from "@/server/models/workout-plan-exercise"
import { WorkoutSession } from "@/server/models/workout-session"
import { gymMemberTarget, selfTarget } from "@/server/services/nutrition/member-target"
import { createExercise, listExercises, setExerciseArchived, updateExercise } from "@/server/services/workout/exercise-service"
import {
  assignMyWorkoutPlan,
  assignWorkoutPlan,
  customizeMyWorkoutPlan,
  endWorkoutPlanAssignment,
  getWorkoutPlanForDate,
  listWorkoutPlanAssignments,
} from "@/server/services/workout/workout-assignment-service"
import {
  addPlannedExercise,
  addWorkoutDay,
  createWorkoutPlan,
  deleteWorkoutDay,
  getWorkoutPlanDetail,
  listWorkoutPlans,
  removePlannedExercise,
  reorderPlannedExercises,
  reorderWorkoutDays,
  setWorkoutPlanArchived,
  updatePlannedExercise,
  updateWorkoutDay,
  updateWorkoutPlan,
} from "@/server/services/workout/workout-plan-service"
import {
  addSetLog,
  discardWorkoutSession,
  finishWorkoutSession,
  getWorkoutDayOverview,
  getWorkoutSession,
  listWorkoutHistory,
  removeSetLog,
  setExerciseSessionCompleted,
  startWorkoutSession,
  updateSetLog,
} from "@/server/services/workout/workout-session-service"
import type { GymAdminUser, MemberUser, SessionUser } from "@/types/auth"

import { devAccounts, seedDevelopmentData } from "../scripts/lib/seed-data"

const [gymA, gymB] = devAccounts.gyms
let replSet: MongoMemoryReplSet
let adminA: GymAdminUser
let adminB: GymAdminUser
let memberA1: MemberUser
let memberA2: MemberUser
let memberB1: MemberUser

async function contextFor(email: string): Promise<SessionUser> {
  const user = await crossTenant(User.findOne({ email })).lean()
  assert.ok(user)
  const result = await loadSessionUser(user._id.toString())
  assert.ok(result.ok)
  return result.user
}
const isCode = (code: DomainError["code"]) => (e: unknown) => e instanceof DomainError && e.code === code
const isValidation = (field?: string) => (e: unknown) =>
  e instanceof ValidationError && (!field || Boolean(e.fieldErrors[field]?.length))

let bench: string
let press: string
let squat: string
let gymPlan: string
let pushDay: string
let legDay: string
let benchItem: string
let pressItem: string

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ launchTimeout: 60_000 }],
  })
  process.env.MONGODB_URI = replSet.getUri("fittrack-workout-test")
  await seedDevelopmentData("test-password-123")
  adminA = (await contextFor(gymA.admin.email)) as GymAdminUser
  adminB = (await contextFor(gymB.admin.email)) as GymAdminUser
  memberA1 = (await contextFor(gymA.members[0].email)) as MemberUser
  memberA2 = (await contextFor(gymA.members[1].email)) as MemberUser
  memberB1 = (await contextFor(gymB.members[0].email)) as MemberUser
})

after(async () => {
  await disconnectFromDatabase()
  await replSet?.stop()
})

describe("exercise library", () => {
  test("admin creates, edits, archives and restores exercises; members can't create", async () => {
    bench = (await createExercise(adminA, { name: "Bench Press", muscleGroup: "Chest", category: "STRENGTH", equipment: "Barbell" })).id
    press = (await createExercise(adminA, { name: "Overhead Press", muscleGroup: "Shoulders", category: "STRENGTH" })).id
    squat = (await createExercise(adminA, { name: "Back Squat", muscleGroup: "Legs", category: "STRENGTH" })).id
    const updated = await updateExercise(adminA, bench, {
      name: "Barbell Bench Press",
      muscleGroup: "Chest",
      category: "STRENGTH",
      description: "Flat bench",
    })
    assert.equal(updated.name, "Barbell Bench Press")
    assert.equal(updated.description, "Flat bench")

    const temp = (await createExercise(adminA, { name: "Temp", muscleGroup: "Core", category: "OTHER" })).id
    await setExerciseArchived(adminA, temp, true)
    assert.ok(!(await listExercises(adminA)).some((e) => e.id === temp), "archived hidden by default")
    assert.ok((await listExercises(adminA, { includeArchived: true })).some((e) => e.id === temp))
    assert.ok(!(await listExercises(memberA1, { includeArchived: true })).some((e) => e.id === temp), "members never see archived")
    await setExerciseArchived(adminA, temp, false)
    assert.ok((await listExercises(adminA)).some((e) => e.id === temp), "restored")

    await assert.rejects(
      () => createExercise(memberA1 as unknown as GymAdminUser, { name: "Mine", muscleGroup: "Core", category: "OTHER" }),
      ForbiddenError
    )
    await assert.rejects(() => createExercise(adminA, { name: "", muscleGroup: "Core", category: "OTHER" }), isValidation("name"))
    await assert.rejects(
      () => createExercise(adminA, { name: "X", muscleGroup: "Wings" as never, category: "OTHER" }),
      isValidation("muscleGroup")
    )
  })

  test("search and filters", async () => {
    assert.deepEqual((await listExercises(adminA, { query: "squat" })).map((e) => e.name), ["Back Squat"])
    assert.deepEqual((await listExercises(adminA, { muscleGroup: "Shoulders" })).map((e) => e.name), ["Overhead Press"])
    assert.ok((await listExercises(adminA, { query: ".*" })).length === 0, "regex input is escaped")
    assert.ok((await listExercises(adminA, { muscleGroup: "$ne" })).length > 0, "unknown filter values are ignored, not injected")
  })

  test("tenant isolation: library, updates and forged gymId", async () => {
    assert.deepEqual(await listExercises(adminB), [])
    assert.deepEqual(await listExercises(memberB1), [])
    await assert.rejects(
      () => updateExercise(adminB, bench, { name: "Hacked", muscleGroup: "Chest", category: "STRENGTH" }),
      isCode("NOT_FOUND")
    )
    await assert.rejects(() => setExerciseArchived(adminB, bench, true), isCode("NOT_FOUND"))
    const forged = await createExercise(adminB, { name: "Forged", muscleGroup: "Core", category: "OTHER", gymId: adminA.gymId } as never)
    assert.ok(!(await listExercises(adminA)).some((e) => e.id === forged.id), "forged gymId ignored")
    assert.equal((await listExercises(adminA, { query: "Bench" }))[0].name, "Barbell Bench Press", "gym A unchanged")
  })
})

describe("workout plans, days and planned exercises", () => {
  test("admin creates a gym plan with days and exercises", async () => {
    gymPlan = (await createWorkoutPlan(adminA, { name: "Push Pull Legs", description: "3-day split" })).id
    const stored = await WorkoutPlan.findOne({ gymId: adminA.gymId, _id: gymPlan }).lean()
    assert.equal(stored?.ownerUserId, null)
    assert.equal(stored?.createdBy.toString(), adminA.id)

    pushDay = (await addWorkoutDay(adminA, gymPlan, { name: "Push" })).id
    const pullDay = (await addWorkoutDay(adminA, gymPlan, { name: "Pull", description: "Back & biceps" })).id
    legDay = (await addWorkoutDay(adminA, gymPlan, { name: "Legs" })).id
    benchItem = (
      await addPlannedExercise(adminA, pushDay, {
        exerciseId: bench, sets: 4, repsMin: 6, repsMax: 8, targetWeight: 80, weightUnit: "kg", restSeconds: 120,
      })
    ).id
    pressItem = (await addPlannedExercise(adminA, pushDay, { exerciseId: press, sets: "3", repsMin: "8", repsMax: "10", targetWeight: "45", restSeconds: "90" })).id
    await addPlannedExercise(adminA, legDay, { exerciseId: squat, sets: 5, repsMin: 5 })

    const detail = (await getWorkoutPlanDetail(adminA, gymPlan))!
    assert.deepEqual(detail.days.map((d) => d.name), ["Push", "Pull", "Legs"])
    assert.deepEqual(detail.days[0].exercises.map((e) => e.exerciseName), ["Barbell Bench Press", "Overhead Press"])
    assert.equal(detail.days[0].exercises[0].repsMax, 8)
    assert.equal(detail.days[2].exercises[0].repsMax, null)
    assert.equal(detail.days[1].description, "Back & biceps")
    assert.equal(detail.days[1].exercises.length, 0)
    void pullDay
  })

  test("validation of planned exercises", async () => {
    await assert.rejects(() => addPlannedExercise(adminA, pushDay, { exerciseId: bench, sets: 0, repsMin: 5 }), isValidation("sets"))
    await assert.rejects(() => addPlannedExercise(adminA, pushDay, { exerciseId: bench, sets: 3, repsMin: 10, repsMax: 5 }), isValidation("repsMax"))
    await assert.rejects(() => addPlannedExercise(adminA, pushDay, { exerciseId: bench, sets: 3, repsMin: "" }), isValidation("repsMin"))
    await assert.rejects(() => addPlannedExercise(adminA, pushDay, { exerciseId: bench, sets: 3, repsMin: 5, targetWeight: -1 }), isValidation("targetWeight"))
  })

  test("update, reorder and remove days and planned exercises", async () => {
    await updateWorkoutPlan(adminA, gymPlan, { name: "PPL", description: "" })
    await updateWorkoutDay(adminA, pushDay, { name: "Push Day" })
    await updatePlannedExercise(adminA, benchItem, { sets: 5, repsMin: 5, targetWeight: 85, weightUnit: "kg", restSeconds: 150, notes: "Pause reps" })
    let detail = (await getWorkoutPlanDetail(adminA, gymPlan))!
    assert.equal(detail.name, "PPL")
    assert.equal(detail.days[0].name, "Push Day")
    assert.equal(detail.days[0].exercises[0].sets, 5)
    assert.equal(detail.days[0].exercises[0].notes, "Pause reps")
    assert.equal(detail.days[0].exercises[0].repsMax, null, "cleared range")

    await reorderPlannedExercises(adminA, pushDay, [pressItem, benchItem])
    detail = (await getWorkoutPlanDetail(adminA, gymPlan))!
    assert.deepEqual(detail.days[0].exercises.map((e) => e.exerciseName), ["Overhead Press", "Barbell Bench Press"])
    await reorderPlannedExercises(adminA, pushDay, [benchItem, pressItem])
    await assert.rejects(() => reorderPlannedExercises(adminA, pushDay, [benchItem]), isCode("CONFLICT"))

    const ids = detail.days.map((d) => d.id)
    await reorderWorkoutDays(adminA, gymPlan, [ids[2], ids[0], ids[1]])
    assert.deepEqual((await getWorkoutPlanDetail(adminA, gymPlan))!.days.map((d) => d.name), ["Legs", "Push Day", "Pull"])
    await reorderWorkoutDays(adminA, gymPlan, ids)
    await assert.rejects(() => reorderWorkoutDays(adminA, gymPlan, [ids[0], ids[1]]), isCode("CONFLICT"))

    const extra = (await addPlannedExercise(adminA, pushDay, { exerciseId: squat, sets: 1, repsMin: 1 })).id
    await removePlannedExercise(adminA, extra)
    assert.equal((await getWorkoutPlanDetail(adminA, gymPlan))!.days[0].exercises.length, 2)

    const tmpDay = (await addWorkoutDay(adminA, gymPlan, { name: "Temp" })).id
    await addPlannedExercise(adminA, tmpDay, { exerciseId: squat, sets: 1, repsMin: 1 })
    await deleteWorkoutDay(adminA, tmpDay)
    assert.equal(await WorkoutPlanExercise.countDocuments({ gymId: adminA.gymId, workoutPlanDayId: tmpDay }), 0, "exercises deleted with the day")
    assert.equal((await getWorkoutPlanDetail(adminA, gymPlan))!.days.length, 3)
  })

  test("archived exercises can't be newly added; archived plans are read-only", async () => {
    const old = (await createExercise(adminA, { name: "Old", muscleGroup: "Core", category: "OTHER" })).id
    await setExerciseArchived(adminA, old, true)
    await assert.rejects(() => addPlannedExercise(adminA, pushDay, { exerciseId: old, sets: 1, repsMin: 1 }), isCode("EXERCISE_ARCHIVED"))

    const scratch = (await createWorkoutPlan(adminA, { name: "Scratch" })).id
    const day = (await addWorkoutDay(adminA, scratch, { name: "A" })).id
    await setWorkoutPlanArchived(adminA, scratch, true)
    assert.ok((await listWorkoutPlans(adminA, { status: "ARCHIVED" })).some((p) => p.id === scratch))
    await assert.rejects(() => addWorkoutDay(adminA, scratch, { name: "B" }), isCode("PLAN_ARCHIVED"))
    await assert.rejects(() => addPlannedExercise(adminA, day, { exerciseId: bench, sets: 1, repsMin: 1 }), isCode("PLAN_ARCHIVED"))
    await assert.rejects(() => updateWorkoutPlan(adminA, scratch, { name: "x" }), isCode("PLAN_ARCHIVED"))
    await setWorkoutPlanArchived(adminA, scratch, false)
    await updateWorkoutPlan(adminA, scratch, { name: "Scratch 2" })
  })

  test("tenant isolation for plans", async () => {
    assert.deepEqual(await listWorkoutPlans(adminB), [])
    assert.equal(await getWorkoutPlanDetail(adminB, gymPlan), null)
    await assert.rejects(() => updateWorkoutPlan(adminB, gymPlan, { name: "x" }), isCode("NOT_FOUND"))
    await assert.rejects(() => addWorkoutDay(adminB, gymPlan, { name: "x" }), isCode("NOT_FOUND"))
    await assert.rejects(() => addPlannedExercise(adminB, pushDay, { exerciseId: bench, sets: 1, repsMin: 1 }), isCode("NOT_FOUND"))
    await assert.rejects(() => updatePlannedExercise(adminB, benchItem, { sets: 1, repsMin: 1 }), isCode("NOT_FOUND"))
    await assert.rejects(() => removePlannedExercise(adminB, benchItem), isCode("NOT_FOUND"))
    // A gym B plan can't use gym A's exercise.
    const bPlan = (await createWorkoutPlan(adminB, { name: "B plan" })).id
    const bDay = (await addWorkoutDay(adminB, bPlan, { name: "D" })).id
    await assert.rejects(() => addPlannedExercise(adminB, bDay, { exerciseId: bench, sets: 1, repsMin: 1 }), isCode("NOT_FOUND"))
  })
})

describe("member's personal plans and ownership", () => {
  let mine: string
  let mineDay: string

  test("member creates and edits their own plan using the gym's exercises", async () => {
    mine = (await createWorkoutPlan(memberA1, { name: "My Plan", gymId: adminB.gymId, ownerUserId: memberA2.id, createdBy: adminA.id } as never)).id
    const stored = await WorkoutPlan.findOne({ gymId: adminA.gymId, _id: mine }).lean()
    assert.equal(stored?.ownerUserId?.toString(), memberA1.id, "forged ownerUserId ignored")
    assert.equal(stored?.createdBy.toString(), memberA1.id)
    assert.equal(stored?.gymId.toString(), adminA.gymId)
    mineDay = (await addWorkoutDay(memberA1, mine, { name: "Full body" })).id
    await addPlannedExercise(memberA1, mineDay, { exerciseId: bench, sets: 3, repsMin: 10 })
    await updateWorkoutPlan(memberA1, mine, { name: "My Plan v2" })
    assert.deepEqual((await listWorkoutPlans(memberA1)).map((p) => p.name), ["My Plan v2"])
    assert.ok(!(await listWorkoutPlans(adminA)).some((p) => p.id === mine), "not in the admin's gym library")
    assert.deepEqual(await listWorkoutPlans(memberA2), [])
  })

  test("member cannot read or touch the gym plan, or another member's plan", async () => {
    assert.equal(await getWorkoutPlanDetail(memberA1, gymPlan), null)
    await assert.rejects(() => updateWorkoutPlan(memberA1, gymPlan, { name: "Hijack" }), isCode("NOT_FOUND"))
    await assert.rejects(() => addWorkoutDay(memberA1, gymPlan, { name: "Injected" }), isCode("NOT_FOUND"))
    await assert.rejects(() => updateWorkoutDay(memberA1, pushDay, { name: "Hijack" }), isCode("NOT_FOUND"))
    await assert.rejects(() => deleteWorkoutDay(memberA1, pushDay), isCode("NOT_FOUND"))
    await assert.rejects(() => addPlannedExercise(memberA1, pushDay, { exerciseId: squat, sets: 1, repsMin: 1 }), isCode("NOT_FOUND"))
    await assert.rejects(() => updatePlannedExercise(memberA1, benchItem, { sets: 12, repsMin: 1 }), isCode("NOT_FOUND"))
    await assert.rejects(() => removePlannedExercise(memberA1, benchItem), isCode("NOT_FOUND"))
    await assert.rejects(() => reorderPlannedExercises(memberA1, pushDay, [pressItem, benchItem]), isCode("NOT_FOUND"))
    await assert.rejects(() => setWorkoutPlanArchived(memberA1, gymPlan, true), isCode("NOT_FOUND"))
    const detail = (await getWorkoutPlanDetail(adminA, gymPlan))!
    assert.equal(detail.name, "PPL")
    assert.equal(detail.status, "ACTIVE")
    assert.equal(detail.days[0].exercises[0].sets, 5, "gym plan unchanged")

    assert.equal(await getWorkoutPlanDetail(memberA2, mine), null)
    await assert.rejects(() => updateWorkoutPlan(memberA2, mine, { name: "Hijack" }), isCode("NOT_FOUND"))
    await assert.rejects(() => addWorkoutDay(memberA2, mine, { name: "x" }), isCode("NOT_FOUND"))
    await assert.rejects(() => addPlannedExercise(memberA2, mineDay, { exerciseId: bench, sets: 1, repsMin: 1 }), isCode("NOT_FOUND"))
  })

  test("admin can view but not mutate a member's personal plan", async () => {
    const view = await getWorkoutPlanDetail(adminA, mine)
    assert.equal(view?.ownerUserId, memberA1.id)
    await assert.rejects(() => updateWorkoutPlan(adminA, mine, { name: "Admin rename" }), isCode("NOT_FOUND"))
    await assert.rejects(() => addWorkoutDay(adminA, mine, { name: "x" }), isCode("NOT_FOUND"))
    await assert.rejects(() => setWorkoutPlanArchived(adminA, mine, true), isCode("NOT_FOUND"))
    assert.equal((await getWorkoutPlanDetail(adminB, mine)), null, "another gym's admin sees nothing")
  })

  test("a member can't be an editor from another gym's context or without a gym", async () => {
    await assert.rejects(() => createWorkoutPlan({ ...memberA1, gymId: null } as never, { name: "x" }), ForbiddenError)
    await assert.rejects(() => createWorkoutPlan({ ...memberA1, role: "SUPER_ADMIN" } as never, { name: "x" }), ForbiddenError)
  })
})

describe("assignments", () => {
  test("admin assigns a gym plan; personal plans can't be assigned by admin or to others", async () => {
    const myPlan = (await createWorkoutPlan(memberA2, { name: "A2's plan" })).id
    await assert.rejects(
      () => assignWorkoutPlan(adminA, { workoutPlanId: myPlan, memberId: memberA2.id, startDate: "2026-10-01" }),
      isCode("NOT_FOUND"),
      "admin can't assign a member's personal plan"
    )
    await assert.rejects(
      () => assignMyWorkoutPlan(memberA1, { workoutPlanId: myPlan, startDate: "2026-10-01" }),
      isCode("NOT_FOUND"),
      "a member can't activate someone else's plan"
    )
    await assert.rejects(
      () => assignMyWorkoutPlan(memberA1, { workoutPlanId: gymPlan, startDate: "2026-10-01" }),
      isCode("NOT_FOUND"),
      "a member can't self-assign a gym plan"
    )
    await assert.rejects(
      () => assignWorkoutPlan(adminA, { workoutPlanId: gymPlan, memberId: memberB1.id, startDate: "2026-10-01" }),
      isCode("NOT_FOUND"),
      "other gym's member"
    )
    await assert.rejects(
      () => assignWorkoutPlan(adminB, { workoutPlanId: gymPlan, memberId: memberB1.id, startDate: "2026-10-01" }),
      isCode("NOT_FOUND"),
      "other gym's plan"
    )
    await assert.rejects(
      () => assignWorkoutPlan(memberA1 as unknown as GymAdminUser, { workoutPlanId: gymPlan, memberId: memberA2.id, startDate: "2026-10-01" }),
      ForbiddenError
    )

    await assignWorkoutPlan(adminA, { workoutPlanId: gymPlan, memberId: memberA1.id, startDate: "2026-10-01", assignedBy: memberB1.id } as never)
    await assignWorkoutPlan(adminA, { workoutPlanId: gymPlan, memberId: memberA2.id, startDate: "2026-10-01" })
    const a = await WorkoutPlanAssignment.findOne({ gymId: adminA.gymId, userId: memberA1.id }).lean()
    assert.equal(a?.assignedBy.toString(), adminA.id, "forged assignedBy ignored")
  })

  test("dates are required and validated; one active plan; replace needs confirmation", async () => {
    const other = (await createWorkoutPlan(adminA, { name: "Other" })).id
    await assert.rejects(() => assignWorkoutPlan(adminA, { workoutPlanId: other, memberId: memberA1.id } as never), isValidation("startDate"))
    await assert.rejects(() => assignWorkoutPlan(adminA, { workoutPlanId: other, memberId: memberA1.id, startDate: "2026-02-31" }), isValidation("startDate"))
    await assert.rejects(
      () => assignWorkoutPlan(adminA, { workoutPlanId: other, memberId: memberA1.id, startDate: "2026-10-05", endDate: "2026-10-01" }),
      isValidation("endDate")
    )
    await assert.rejects(
      () => assignWorkoutPlan(adminA, { workoutPlanId: other, memberId: memberA1.id, startDate: "2026-10-05" }),
      isCode("ACTIVE_WORKOUT_ASSIGNMENT_EXISTS")
    )
    assert.equal(await WorkoutPlanAssignment.countDocuments({ gymId: adminA.gymId, userId: memberA1.id, status: "ACTIVE" }), 1)
    await assert.rejects(
      () => assignWorkoutPlan(adminA, { workoutPlanId: other, memberId: memberA1.id, startDate: "2026-09-01", replaceActive: true }),
      isValidation("startDate"),
      "new plan can't start before the current one"
    )
    await assignWorkoutPlan(adminA, { workoutPlanId: other, memberId: memberA1.id, startDate: "2026-10-05", replaceActive: true })
    const history = await listWorkoutPlanAssignments(selfTarget(memberA1))
    assert.deepEqual(history.map((h) => [h.workoutPlanName, h.status, h.startDate, h.endDate]), [
      ["Other", "ACTIVE", "2026-10-05", null],
      ["PPL", "COMPLETED", "2026-10-01", "2026-10-05"],
    ])
    // Plan for date follows the history: before the hand-over → PPL, after → Other.
    assert.equal((await getWorkoutPlanForDate(selfTarget(memberA1), "2026-10-03"))?.plan.name, "PPL")
    assert.equal((await getWorkoutPlanForDate(selfTarget(memberA1), "2026-10-05"))?.plan.name, "Other")
    assert.equal(await getWorkoutPlanForDate(selfTarget(memberA1), "2026-09-30"), null)
    // Put A1 back on the gym plan for later tests.
    await assignWorkoutPlan(adminA, { workoutPlanId: gymPlan, memberId: memberA1.id, startDate: "2026-10-06", replaceActive: true })
  })

  test("end assignment: dates are explicit; admin only for their gym", async () => {
    const a2 = (await listWorkoutPlanAssignments(selfTarget(memberA2)))[0]
    await assert.rejects(() => endWorkoutPlanAssignment(adminA, a2.id, { status: "COMPLETED" } as never), isValidation("endDate"))
    await assert.rejects(() => endWorkoutPlanAssignment(adminB, a2.id, { status: "COMPLETED", endDate: "2026-10-10" }), isCode("NOT_FOUND"))
    await assert.rejects(() => endWorkoutPlanAssignment(adminA, a2.id, { status: "COMPLETED", endDate: "2026-09-01" }), isValidation("endDate"))
    // Re-assign A2 later in the "customize" tests; here just end and restore.
    await endWorkoutPlanAssignment(adminA, a2.id, { status: "COMPLETED", endDate: "2026-10-10" })
    const ended = (await listWorkoutPlanAssignments(selfTarget(memberA2)))[0]
    assert.equal(ended.status, "COMPLETED")
    assert.equal(ended.endDate, "2026-10-10")
    await assert.rejects(() => endWorkoutPlanAssignment(adminA, a2.id, { status: "COMPLETED", endDate: "2026-10-11" }), isCode("NOT_FOUND"), "already ended")
    await assignWorkoutPlan(adminA, { workoutPlanId: gymPlan, memberId: memberA2.id, startDate: "2026-10-10" })
  })

  test("a member can switch to their own plan with explicit replace", async () => {
    const mineB = (await createWorkoutPlan(memberA2, { name: "A2 mine" })).id
    await assert.rejects(() => assignMyWorkoutPlan(memberA2, { workoutPlanId: mineB, startDate: "2026-10-11" }), isCode("ACTIVE_WORKOUT_ASSIGNMENT_EXISTS"))
    await assignMyWorkoutPlan(memberA2, { workoutPlanId: mineB, startDate: "2026-10-11", replaceActive: true })
    assert.equal((await listWorkoutPlanAssignments(selfTarget(memberA2)))[0].workoutPlanKind, "PERSONAL")
    // restore for the customize tests
    await assignWorkoutPlan(adminA, { workoutPlanId: gymPlan, memberId: memberA2.id, startDate: "2026-10-11", replaceActive: true })
  })
})

describe("customize = copy", () => {
  const snapshot = async () =>
    JSON.stringify({
      plan: await WorkoutPlan.findOne({ gymId: adminA.gymId, _id: gymPlan }).lean(),
      days: await WorkoutPlanDay.find({ gymId: adminA.gymId, workoutPlanId: gymPlan }).sort({ order: 1 }).lean(),
      items: await WorkoutPlanExercise.find({ gymId: adminA.gymId, workoutPlanId: gymPlan }).sort({ _id: 1 }).lean(),
    })
  let copyId: string

  test("copies plan, days and exercises with new ids; the gym plan is untouched", async () => {
    const before = await snapshot()
    const result = await customizeMyWorkoutPlan(memberA1, { startDate: "2026-10-08" })
    assert.equal(result.copied, true)
    copyId = result.planId
    const copy = await WorkoutPlan.findOne({ gymId: adminA.gymId, _id: copyId }).lean()
    assert.equal(copy?.ownerUserId?.toString(), memberA1.id)
    assert.equal(copy?.sourcePlanId?.toString(), gymPlan)
    assert.equal(copy?.createdBy.toString(), memberA1.id)

    const original = (await getWorkoutPlanDetail(adminA, gymPlan))!
    const mine = (await getWorkoutPlanDetail(memberA1, copyId))!
    assert.deepEqual(mine.days.map((d) => d.name), original.days.map((d) => d.name))
    assert.deepEqual(
      mine.days.map((d) => d.exercises.map((e) => [e.exerciseName, e.sets, e.repsMin, e.repsMax, e.targetWeight, e.notes])),
      original.days.map((d) => d.exercises.map((e) => [e.exerciseName, e.sets, e.repsMin, e.repsMax, e.targetWeight, e.notes]))
    )
    const originalIds = new Set([original.id, ...original.days.flatMap((d) => [d.id, ...d.exercises.map((e) => e.id)])])
    for (const id of [mine.id, ...mine.days.flatMap((d) => [d.id, ...d.exercises.map((e) => e.id)])]) {
      assert.ok(!originalIds.has(id), "all records are new")
    }
    assert.equal(await snapshot(), before, "gym plan unchanged")
  })

  test("history: gym plan before, copy from the start date; one active assignment", async () => {
    const history = await listWorkoutPlanAssignments(selfTarget(memberA1))
    assert.deepEqual(history.slice(0, 2).map((h) => [h.workoutPlanKind, h.status, h.startDate, h.endDate]), [
      ["PERSONAL", "ACTIVE", "2026-10-08", null],
      ["GYM", "COMPLETED", "2026-10-06", "2026-10-08"],
    ])
    assert.equal((await getWorkoutPlanForDate(selfTarget(memberA1), "2026-10-07"))?.plan.name, "PPL")
    assert.equal((await getWorkoutPlanForDate(selfTarget(memberA1), "2026-10-08"))?.plan.id, copyId)
    assert.equal(await WorkoutPlanAssignment.countDocuments({ gymId: adminA.gymId, userId: memberA1.id, status: "ACTIVE" }), 1)
  })

  test("another member on the same gym plan is unaffected; the member edits only their copy", async () => {
    const before = await snapshot()
    const active = (await listWorkoutPlanAssignments(selfTarget(memberA2)))[0]
    assert.equal(active.workoutPlanId, gymPlan)
    assert.equal(active.status, "ACTIVE")

    const mine = (await getWorkoutPlanDetail(memberA1, copyId))!
    await updateWorkoutPlan(memberA1, copyId, { name: "Customized" })
    await updatePlannedExercise(memberA1, mine.days[0].exercises[0].id, { sets: 10, repsMin: 3, targetWeight: 100, weightUnit: "kg" })
    await addWorkoutDay(memberA1, copyId, { name: "Extra" })
    assert.equal((await getWorkoutPlanDetail(memberA1, copyId))!.days[0].exercises[0].sets, 10)
    assert.equal(await snapshot(), before, "gym plan still unchanged after editing the copy")
    assert.equal((await getWorkoutPlanDetail(adminA, gymPlan))!.name, "PPL")
    assert.equal(await getWorkoutPlanDetail(memberA2, copyId), null, "A2 can't see A1's copy")
    assert.ok((await getWorkoutPlanDetail(adminA, copyId)), "admin can view it read-only")
  })

  test("customizing again doesn't duplicate: an existing copy is reused; own plan is a no-op", async () => {
    const noop = await customizeMyWorkoutPlan(memberA1, { startDate: "2026-10-09" })
    assert.deepEqual(noop, { planId: copyId, copied: false })

    // Put A1 back on the gym plan, then customize again → reuse the same copy.
    await assignWorkoutPlan(adminA, { workoutPlanId: gymPlan, memberId: memberA1.id, startDate: "2026-10-12", replaceActive: true })
    const again = await customizeMyWorkoutPlan(memberA1, { startDate: "2026-10-12" })
    assert.deepEqual(again, { planId: copyId, copied: false })
    assert.equal(await WorkoutPlan.countDocuments({ gymId: adminA.gymId, ownerUserId: memberA1.id, sourcePlanId: gymPlan }), 1)
    assert.equal((await listWorkoutPlanAssignments(selfTarget(memberA1)))[0].workoutPlanId, copyId)
  })

  test("customize needs a date and an active plan", async () => {
    await assert.rejects(() => customizeMyWorkoutPlan(memberA1, {} as never), isValidation("startDate"))
    const nobody = memberB1
    await assert.rejects(() => customizeMyWorkoutPlan(nobody, { startDate: "2026-10-01" }), isCode("NOT_FOUND"))
  })
})

describe("actual workouts", () => {
  let sessionId: string
  let benchEx: string
  let pressEx: string
  let sets: { id: string; setNumber: number }[] = []
  const gymPlanItemsBefore = async () =>
    JSON.stringify(await WorkoutPlanExercise.find({ gymId: adminA.gymId, workoutPlanId: gymPlan }).sort({ _id: 1 }).lean())

  test("start a workout: snapshots plan values, creates empty set rows, one in progress at a time", async () => {
    // A2 is on the gym plan from 2026-10-11.
    const planBefore = await gymPlanItemsBefore()
    const started = await startWorkoutSession(memberA2, { date: "2026-10-12", workoutPlanDayId: pushDay })
    sessionId = started.id
    const view = (await getWorkoutSession(selfTarget(memberA2), sessionId))!
    assert.equal(view.status, "IN_PROGRESS")
    assert.equal(view.date, "2026-10-12")
    assert.equal(view.dayName, "Push Day")
    assert.equal(view.planName, "PPL")
    assert.deepEqual(view.exercises.map((e) => e.exerciseName), ["Barbell Bench Press", "Overhead Press"])
    benchEx = view.exercises[0].id
    pressEx = view.exercises[1].id
    assert.equal(view.exercises[0].planned.sets, 5)
    assert.equal(view.exercises[0].planned.targetWeight, 85)
    assert.equal(view.exercises[0].sets.length, 5, "one empty row per planned set")
    assert.ok(view.exercises[0].sets.every((s) => !s.completed && s.weight === null && s.reps === null), "no values pre-filled from the plan")
    sets = view.exercises[0].sets
    assert.equal(await gymPlanItemsBefore(), planBefore)

    await assert.rejects(() => startWorkoutSession(memberA2, { date: "2026-10-12", workoutPlanDayId: legDay }), isCode("SESSION_IN_PROGRESS"))
  })

  test("start validation: date required, day must belong to my plan for that date", async () => {
    await assert.rejects(() => startWorkoutSession(memberA2, { workoutPlanDayId: pushDay } as never), isValidation("date"))
    await assert.rejects(() => startWorkoutSession(memberA2, { date: "tomorrow", workoutPlanDayId: pushDay }), isValidation("date"))
    await discardWorkoutSession(memberA2, sessionId)
    await assert.rejects(() => startWorkoutSession(memberA2, { date: "2026-09-01", workoutPlanDayId: pushDay }), isCode("NOT_FOUND"), "no plan applied on that date")
    // A day of someone else's plan (A1's personal copy day) can't be used.
    const copyDay = (await getWorkoutPlanDetail(memberA1, (await listWorkoutPlanAssignments(selfTarget(memberA1)))[0].workoutPlanId))!.days[0].id
    await assert.rejects(() => startWorkoutSession(memberA2, { date: "2026-10-12", workoutPlanDayId: copyDay }), isCode("NOT_FOUND"))
    const emptyDay = (await getWorkoutPlanDetail(adminA, gymPlan))!.days.find((d) => d.name === "Pull")!.id
    await assert.rejects(() => startWorkoutSession(memberA2, { date: "2026-10-12", workoutPlanDayId: emptyDay }), isValidation("workoutPlanDayId"))
    await assert.rejects(() => startWorkoutSession(adminA as unknown as MemberUser, { date: "2026-10-12", workoutPlanDayId: pushDay }), ForbiddenError)
  })

  test("log sets: actual values are independent of the plan; update, add, remove, complete", async () => {
    const planBefore = await gymPlanItemsBefore()
    sessionId = (await startWorkoutSession(memberA2, { date: "2026-10-12", workoutPlanDayId: pushDay })).id
    const view = (await getWorkoutSession(selfTarget(memberA2), sessionId))!
    benchEx = view.exercises[0].id
    pressEx = view.exercises[1].id
    sets = view.exercises[0].sets
    await assert.rejects(() => finishWorkoutSession(memberA2, sessionId), isCode("EMPTY_SESSION"), "nothing completed yet")

    // Planned 85 kg × 5; performed 90 kg × 4 and 80 kg × 6.
    await updateSetLog(memberA2, sets[0].id, { weight: 90, reps: 4, completed: true })
    await updateSetLog(memberA2, sets[1].id, { weight: "80", reps: "6", completed: true })
    const extra = await addSetLog(memberA2, benchEx, { weight: 70, reps: 10, completed: true })
    await removeSetLog(memberA2, sets[4].id) // drop an unfilled set → numbers stay sequential
    await setExerciseSessionCompleted(memberA2, benchEx, true)
    await updateSetLog(memberA2, sets[1].id, { weight: 82.5, reps: 6, completed: true }) // edit
    await updateSetLog(memberA2, (await getWorkoutSession(selfTarget(memberA2), sessionId))!.exercises[1].sets[0].id, { weight: null, reps: 12, completed: true }) // bodyweight

    const mid = (await getWorkoutSession(selfTarget(memberA2), sessionId))!
    const bench1 = mid.exercises[0]
    assert.deepEqual(bench1.sets.map((s) => s.setNumber), [1, 2, 3, 4, 5], "renumbered after removal (4 planned + 1 added)")
    assert.deepEqual(bench1.sets.filter((s) => s.completed).map((s) => [s.weight, s.reps]), [[90, 4], [82.5, 6], [70, 10]])
    assert.equal(bench1.completed, true)
    assert.equal(bench1.planned.targetWeight, 85, "planned snapshot unchanged by actual values")
    assert.equal(bench1.planned.sets, 5)
    assert.equal(mid.exercises[1].sets[0].weight, null)
    void extra
    assert.equal(await gymPlanItemsBefore(), planBefore, "plan records untouched by logging")

    await assert.rejects(() => updateSetLog(memberA2, sets[2].id, { weight: 50, completed: true }), isValidation("reps"))
    await assert.rejects(() => updateSetLog(memberA2, sets[2].id, { weight: -5, reps: 5 }), isValidation("weight"))
    await assert.rejects(() => updateSetLog(memberA2, sets[2].id, { weight: 5, reps: 1.5 }), isValidation("reps"))
    void pressEx
  })

  test("only the owner can log; other members, admins and other gyms can't", async () => {
    await assert.rejects(() => updateSetLog(memberA1, sets[2].id, { weight: 1, reps: 1, completed: true }), isCode("NOT_FOUND"))
    await assert.rejects(() => removeSetLog(memberA1, sets[2].id), isCode("NOT_FOUND"))
    await assert.rejects(() => addSetLog(memberA1, benchEx, { reps: 5 }), isCode("NOT_FOUND"))
    await assert.rejects(() => setExerciseSessionCompleted(memberA1, benchEx, true), isCode("NOT_FOUND"))
    await assert.rejects(() => finishWorkoutSession(memberA1, sessionId), isCode("NOT_FOUND"))
    await assert.rejects(() => discardWorkoutSession(memberA1, sessionId), isCode("NOT_FOUND"))
    await assert.rejects(() => updateSetLog(memberB1, sets[2].id, { weight: 1, reps: 1, completed: true }), isCode("NOT_FOUND"))
    await assert.rejects(() => updateSetLog(adminA as unknown as MemberUser, sets[2].id, { reps: 1 }), ForbiddenError)
    assert.equal(await getWorkoutSession(selfTarget(memberA1), sessionId), null)
    assert.equal(await getWorkoutSession(selfTarget(memberB1), sessionId), null)
    // Admin of the same gym can read it (read-only target); another gym's admin cannot.
    assert.ok(await getWorkoutSession(await gymMemberTarget(adminA, memberA2.id), sessionId))
    await assert.rejects(() => gymMemberTarget(adminB, memberA2.id), isCode("NOT_FOUND"))
    const stored = await SetLog.findOne({ gymId: adminA.gymId, _id: sets[0].id }).lean()
    assert.equal(stored?.weight, 90, "A1's attempts changed nothing")
  })

  test("finish: needs a completed set, drops unfilled sets, records a real duration", async () => {
    const finished = await finishWorkoutSession(memberA2, sessionId)
    assert.equal(finished.id, sessionId)
    const view = (await getWorkoutSession(selfTarget(memberA2), sessionId))!
    assert.equal(view.status, "COMPLETED")
    assert.ok(view.completedAt && view.durationSeconds !== null && view.durationSeconds >= 0)
    assert.ok(view.exercises.flatMap((e) => e.sets).every((s) => s.completed), "unfilled sets dropped")
    assert.equal(view.date, "2026-10-12", "calendar day stays the one supplied at start")
    await assert.rejects(() => updateSetLog(memberA2, sets[0].id, { weight: 1, reps: 1, completed: true }), isCode("SESSION_CLOSED"))
    await assert.rejects(() => addSetLog(memberA2, benchEx, { reps: 5 }), isCode("SESSION_CLOSED"))
    await assert.rejects(() => finishWorkoutSession(memberA2, sessionId), isCode("SESSION_CLOSED"))
    await assert.rejects(() => discardWorkoutSession(memberA2, sessionId), isCode("SESSION_CLOSED"))
  })

  test("history lists completed workouts with their sets; planned values stay intact", async () => {
    const history = await listWorkoutHistory(selfTarget(memberA2))
    assert.equal(history.length, 1)
    assert.equal(history[0].dayName, "Push Day")
    assert.deepEqual(history[0].exercises[0].sets.map((s) => [s.weight, s.reps]), [[90, 4], [82.5, 6], [70, 10]])
    assert.equal(history[0].exercises[0].planned.targetWeight, 85)
    assert.equal((await listWorkoutHistory(selfTarget(memberA2), { from: "2026-10-13" })).length, 0)
    assert.equal((await listWorkoutHistory(selfTarget(memberA2), { from: "2026-10-12", to: "2026-10-12" })).length, 1)
    await assert.rejects(() => listWorkoutHistory(selfTarget(memberA2), { from: "2026-10-12", to: "2026-10-01" }), isValidation("from"))
    await assert.rejects(() => listWorkoutHistory(selfTarget(memberA2), { from: "nope" }), isValidation("from"))
    assert.deepEqual(await listWorkoutHistory(selfTarget(memberA1)), [], "other members don't see it")
    assert.deepEqual(await listWorkoutHistory(selfTarget(memberB1)), [])
    // Admin reads a member's history through a verified target, read-only service.
    assert.equal((await listWorkoutHistory(await gymMemberTarget(adminA, memberA2.id))).length, 1)
  })

  test("editing the plan after a workout doesn't rewrite that workout", async () => {
    const mine = (await getWorkoutPlanDetail(adminA, gymPlan))!
    await updatePlannedExercise(adminA, mine.days.find((d) => d.name === "Push Day")!.exercises[0].id, { sets: 2, repsMin: 12, targetWeight: 20, weightUnit: "kg" })
    await updateWorkoutDay(adminA, pushDay, { name: "Renamed" })
    const past = (await listWorkoutHistory(selfTarget(memberA2)))[0]
    assert.equal(past.dayName, "Push Day")
    assert.equal(past.exercises[0].planned.targetWeight, 85)
    assert.equal(past.exercises[0].planned.sets, 5)
    assert.equal(await ExerciseSession.countDocuments({ gymId: adminA.gymId, userId: memberA2.id }), 2)
  })

  test("day overview: suggests the next day in rotation, shows progress and today's workouts", async () => {
    // A2 finished "Push Day" (first day with exercises: Push Day, Legs). Next is Legs.
    const overview = await getWorkoutDayOverview(selfTarget(memberA2), "2026-10-12")
    assert.equal(overview.plan?.plan.name, "PPL")
    assert.equal(overview.suggestedDayId, legDay)
    assert.equal(overview.inProgress, null)
    assert.equal(overview.completedToday.length, 1)
    assert.equal((await getWorkoutDayOverview(selfTarget(memberA2), "2026-10-14")).completedToday.length, 0)

    const next = await startWorkoutSession(memberA2, { date: "2026-10-14", workoutPlanDayId: legDay })
    const during = await getWorkoutDayOverview(selfTarget(memberA2), "2026-10-14")
    assert.equal(during.inProgress?.id, next.id)
    await discardWorkoutSession(memberA2, next.id)
    assert.equal(await WorkoutSession.countDocuments({ gymId: adminA.gymId, userId: memberA2.id, status: "IN_PROGRESS" }), 0)
    assert.equal(await SetLog.countDocuments({ gymId: adminA.gymId, workoutSessionId: next.id }), 0, "discard removes its sets")

    const nothing = await getWorkoutDayOverview(selfTarget(memberB1), "2026-10-12")
    assert.equal(nothing.plan, null)
    assert.equal(nothing.suggestedDayId, null)
    await assert.rejects(() => getWorkoutDayOverview(selfTarget(memberA2), "" as never), isValidation())
  })
})

describe("dates and clocks", () => {
  test("the supplied calendar day is stored regardless of the server's UTC clock", async () => {
    // Server clock says Oct 20 23:30 UTC; the member's local day is Oct 21 (e.g. India).
    mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-20T23:30:00Z") })
    try {
      await assignWorkoutPlan(adminA, { workoutPlanId: gymPlan, memberId: memberA2.id, startDate: "2026-10-21", replaceActive: true })
      const day = (await getWorkoutPlanDetail(adminA, gymPlan))!.days.find((d) => d.exercises.length)!.id
      const started = await startWorkoutSession(memberA2, { date: "2026-10-21", workoutPlanDayId: day })
      const stored = await WorkoutSession.findOne({ gymId: adminA.gymId, _id: started.id }).lean()
      assert.equal(stored?.date, "2026-10-21")
      assert.equal(stored?.startedAt.toISOString(), "2026-10-20T23:30:00.000Z", "the timestamp is the real instant")
      const sets = await SetLog.find({ gymId: adminA.gymId, workoutSessionId: started.id }).lean()
      assert.ok(sets.every((s) => s.date === "2026-10-21"))
      await discardWorkoutSession(memberA2, started.id)
    } finally {
      mock.timers.reset()
    }
    const a = (await listWorkoutPlanAssignments(selfTarget(memberA2)))[0]
    assert.equal(a.startDate, "2026-10-21")
  })

  test("no function silently falls back to the server's 'today'", async () => {
    await assert.rejects(() => getWorkoutDayOverview(selfTarget(memberA2), undefined as never), isValidation())
    await assert.rejects(() => getWorkoutPlanForDate(selfTarget(memberA2), undefined as never), isValidation())
    await assert.rejects(() => customizeMyWorkoutPlan(memberA2, { startDate: undefined } as never), isValidation("startDate"))
    await assert.rejects(() => assignMyWorkoutPlan(memberA2, { workoutPlanId: gymPlan } as never), isValidation("startDate"))
    await assert.rejects(() => endWorkoutPlanAssignment(adminA, "000000000000000000000000", { status: "CANCELLED" } as never), isValidation("endDate"))
  })
})
