/**
 * Module 5: performance service — derived from Module 4's completed
 * workouts. Covers progress, records, comparisons, history immutability,
 * explicit plan updates, dates and tenant/ownership security.
 */
import assert from "node:assert/strict"
import { after, before, describe, mock, test } from "node:test"

import { MongoMemoryReplSet } from "mongodb-memory-server"

import { loadSessionUser } from "@/server/auth/account"
import { disconnectFromDatabase } from "@/server/db/connect"
import { crossTenant } from "@/server/db/tenant-guard"
import { DomainError, ValidationError } from "@/server/errors"
import { ExerciseSession } from "@/server/models/exercise-session"
import { SetLog } from "@/server/models/set-log"
import { User } from "@/server/models/user"
import { WorkoutPlanExercise } from "@/server/models/workout-plan-exercise"
import { gymMemberTarget, platformMemberTarget, selfTarget } from "@/server/services/nutrition/member-target"
import { createExercise } from "@/server/services/workout/exercise-service"
import {
  getExerciseProgress,
  getPerformanceHighlight,
  getPlanTargetFor,
  getSessionPerformance,
  listProgressExercises,
} from "@/server/services/workout/performance-service"
import { assignMyWorkoutPlan, assignWorkoutPlan, customizeMyWorkoutPlan } from "@/server/services/workout/workout-assignment-service"
import {
  addPlannedExercise,
  addWorkoutDay,
  createWorkoutPlan,
  getWorkoutPlanDetail,
  setPlannedExerciseTargetWeight,
  updatePlannedExercise,
} from "@/server/services/workout/workout-plan-service"
import {
  addSetLog,
  finishWorkoutSession,
  getWorkoutSession,
  startWorkoutSession,
  updateSetLog,
} from "@/server/services/workout/workout-session-service"
import type { GymAdminUser, MemberUser, SessionUser, SuperAdminUser } from "@/types/auth"

import { devAccounts, seedDevelopmentData } from "../scripts/lib/seed-data"

const [gymA, gymB] = devAccounts.gyms
let replSet: MongoMemoryReplSet
let adminA: GymAdminUser
let adminB: GymAdminUser
let memberA1: MemberUser
let memberA2: MemberUser
let memberB1: MemberUser
let superAdmin: SuperAdminUser

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
let squat: string
let gymPlan: string
let day: string
let benchItem: string
let a2Day: string

/** Run a full workout for `member` on `date`: start → fill planned set rows (+extra) → finish. */
async function workout(member: MemberUser, date: string, sets: [number | null, number][], dayId = day) {
  const { id } = await startWorkoutSession(member, { date, workoutPlanDayId: dayId })
  const view = (await getWorkoutSession(selfTarget(member), id))!
  const benchSets = view.exercises[0].sets
  for (const [i, [weight, reps]] of sets.entries()) {
    if (i < benchSets.length) await updateSetLog(member, benchSets[i].id, { weight, reps, completed: true })
    else await addSetLog(member, view.exercises[0].id, { weight, reps, completed: true })
  }
  await finishWorkoutSession(member, id)
  return id
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ launchTimeout: 60_000 }],
  })
  process.env.MONGODB_URI = replSet.getUri("fittrack-performance-test")
  await seedDevelopmentData("test-password-123")
  adminA = (await contextFor(gymA.admin.email)) as GymAdminUser
  adminB = (await contextFor(gymB.admin.email)) as GymAdminUser
  memberA1 = (await contextFor(gymA.members[0].email)) as MemberUser
  memberA2 = (await contextFor(gymA.members[1].email)) as MemberUser
  memberB1 = (await contextFor(gymB.members[0].email)) as MemberUser
  superAdmin = (await contextFor(devAccounts.superAdmin.email)) as SuperAdminUser

  bench = (await createExercise(adminA, { name: "Bench Press", muscleGroup: "Chest", category: "STRENGTH" })).id
  squat = (await createExercise(adminA, { name: "Squat", muscleGroup: "Legs", category: "STRENGTH" })).id
  gymPlan = (await createWorkoutPlan(adminA, { name: "Strength" })).id
  day = (await addWorkoutDay(adminA, gymPlan, { name: "Push" })).id
  benchItem = (await addPlannedExercise(adminA, day, { exerciseId: bench, sets: 3, repsMin: 8, repsMax: 10, targetWeight: 80 })).id
  await addPlannedExercise(adminA, day, { exerciseId: squat, sets: 1, repsMin: 5, targetWeight: 100 })
  await assignWorkoutPlan(adminA, { workoutPlanId: gymPlan, memberId: memberA1.id, startDate: "2026-09-01" })
})

after(async () => {
  await disconnectFromDatabase()
  await replSet?.stop()
})

describe("empty states", () => {
  test("no completed workouts: nothing is manufactured", async () => {
    const t = selfTarget(memberA1)
    assert.deepEqual(await listProgressExercises(t), [])
    const p = await getExerciseProgress(t, bench)
    assert.equal(p.sessionCount, 0)
    assert.equal(p.latest, null)
    assert.equal(p.comparison, null)
    assert.deepEqual(p.series, [])
    assert.deepEqual(p.records, { highestWeight: null, highestReps: null, highestE1rm: null, highestVolume: null })
    assert.equal(p.recommendation.kind, "INSUFFICIENT_DATA")
    assert.equal(await getPerformanceHighlight(t), null)
  })

  test("an in-progress workout does not count", async () => {
    const { id } = await startWorkoutSession(memberA1, { date: "2026-10-01", workoutPlanDayId: day })
    const view = (await getWorkoutSession(selfTarget(memberA1), id))!
    await updateSetLog(memberA1, view.exercises[0].sets[0].id, { weight: 200, reps: 5, completed: true })
    assert.equal((await getExerciseProgress(selfTarget(memberA1), bench)).sessionCount, 0)
    assert.deepEqual(await listProgressExercises(selfTarget(memberA1)), [])
    // finish it so later tests are clean
    await finishWorkoutSession(memberA1, id)
  })
})

describe("progress over completed workouts", () => {
  const d1 = "2026-10-05"
  const d2 = "2026-10-12"
  const d3 = "2026-10-19"
  let s2: string

  test("one session: metrics and records, nothing to compare yet", async () => {
    // (the 200 kg session from the previous test is on 2026-10-01 and counts as the first)
    const p = await getExerciseProgress(selfTarget(memberA1), bench)
    assert.equal(p.sessionCount, 1)
    assert.equal(p.comparison, null)
    assert.equal(p.previous, null)
    assert.equal(p.recommendation.observation, "Complete more sessions to compare your progress.")
    assert.equal(p.records.highestWeight?.value, 200)
    assert.deepEqual(p.recordsInLatest, [], "the first session has nothing to beat")
  })

  test("second and third sessions: comparison, volume, e1RM, records", async () => {
    await workout(memberA1, d1, [[80, 8], [80, 8], [80, 7]])
    s2 = await workout(memberA1, d2, [[85, 8], [85, 8], [85, 8]])
    const p = await getExerciseProgress(selfTarget(memberA1), bench)
    assert.equal(p.sessionCount, 3)
    assert.equal(p.latest?.date, d2)
    assert.equal(p.previous?.date, d1)
    assert.equal(p.latest?.metrics.totalVolume, 85 * 24)
    assert.equal(p.previous?.metrics.totalVolume, 80 * 23)
    assert.equal(p.comparison?.bestWeightDiff, 5)
    assert.equal(p.comparison?.volumeDiff, 85 * 24 - 80 * 23)
    assert.equal(p.comparison?.bestRepsDiff, 0)
    assert.equal(p.recommendation.kind, "WEIGHT_UP")
    assert.equal(p.recommendation.observation, "Working weight increased by 5 kg while maintaining reps.")
    assert.equal(p.recommendation.suggestion, null)
    assert.equal(p.unit, "kg")
  })

  test("a lower session doesn't erase records; records are lifetime", async () => {
    await workout(memberA1, d3, [[60, 5]])
    const p = await getExerciseProgress(selfTarget(memberA1), bench)
    assert.equal(p.records.highestWeight?.value, 200, "the 200 kg PR is kept")
    assert.equal(p.records.highestWeight?.date, "2026-10-01")
    assert.equal(p.records.highestE1rm?.value, 200 * (1 + 5 / 30))
    assert.equal(p.latest?.date, d3)
    assert.equal(p.recommendation.kind, "WEIGHT_DOWN")
    assert.equal(p.recommendation.suggestion, null)
  })

  test("exercises are independent; the list is ordered by recent use", async () => {
    const list = await listProgressExercises(selfTarget(memberA1))
    assert.deepEqual(list.map((e) => e.name), ["Bench Press"])
    assert.equal(list[0].sessionCount, 4)
    const squatProgress = await getExerciseProgress(selfTarget(memberA1), squat)
    assert.equal(squatProgress.sessionCount, 0, "no squat sets were completed")
  })

  test("series is oldest → newest; the recent table respects from/to and limit", async () => {
    const p = await getExerciseProgress(selfTarget(memberA1), bench)
    assert.deepEqual(p.series.map((s) => s.date), ["2026-10-01", d1, d2, d3])
    assert.deepEqual(p.recent.map((s) => s.date), [d3, d2, d1, "2026-10-01"], "newest first")
    const filtered = await getExerciseProgress(selfTarget(memberA1), bench, { from: d1, to: d2 })
    assert.deepEqual(filtered.recent.map((s) => s.date), [d2, d1])
    assert.equal(filtered.records.highestWeight?.value, 200, "records ignore the table filter")
    assert.equal((await getExerciseProgress(selfTarget(memberA1), bench, { limit: 2 })).recent.length, 2)
    await assert.rejects(() => getExerciseProgress(selfTarget(memberA1), bench, { from: d2, to: d1 }), isValidation("from"))
    await assert.rejects(() => getExerciseProgress(selfTarget(memberA1), bench, { from: "yesterday" }), isValidation("from"))
  })

  test("a session's performance: previous comparable, comparison, new records", async () => {
    const [perf] = await getSessionPerformance(selfTarget(memberA1), s2)
    assert.equal(perf.exerciseName, "Bench Press")
    assert.equal(perf.previous?.date, d1)
    assert.equal(perf.comparison?.bestWeightDiff, 5)
    assert.ok(!perf.newRecords.includes("weight") && !perf.newRecords.includes("e1rm"), "200 kg on 10-01 still beats 85 kg")
    assert.deepEqual(perf.newRecords, ["volume"], "but 85 × 24 is more total volume than anything before it")
    assert.deepEqual(await getSessionPerformance(selfTarget(memberA1), "000000000000000000000000"), [])
  })

  test("a genuinely new record is reported once", async () => {
    const id = await workout(memberA1, "2026-10-26", [[205, 5]])
    const [perf] = await getSessionPerformance(selfTarget(memberA1), id)
    assert.ok(perf.newRecords.includes("weight"))
    assert.ok(perf.newRecords.includes("e1rm"))
    const highlight = await getPerformanceHighlight(selfTarget(memberA1))
    assert.equal(highlight?.kind, "PR")
    assert.equal(highlight?.exerciseName, "Bench Press")
    assert.equal(highlight?.workoutSessionId, id)
    // the next ordinary session doesn't claim it again
    const next = await workout(memberA1, "2026-11-02", [[100, 8]])
    assert.deepEqual((await getSessionPerformance(selfTarget(memberA1), next))[0].newRecords, [])
  })

  test("the top of the planned rep range produces a gentle suggestion; a known step gives a weight", async () => {
    const plan = (await createWorkoutPlan(memberA2, { name: "A2 plan" })).id
    const d = (await addWorkoutDay(memberA2, plan, { name: "Bench day" })).id
    await addPlannedExercise(memberA2, d, { exerciseId: bench, sets: 3, repsMin: 8, repsMax: 10, targetWeight: 70 })
    a2Day = d
    await assignMyWorkoutPlan(memberA2, { workoutPlanId: plan, startDate: "2026-09-01" })
    await workout(memberA2, "2026-10-01", [[70, 8], [70, 8], [70, 8]], d)
    await workout(memberA2, "2026-10-08", [[72.5, 8], [72.5, 8], [72.5, 8]], d)
    await workout(memberA2, "2026-10-15", [[72.5, 10], [72.5, 10], [72.5, 10]], d)
    const p = await getExerciseProgress(selfTarget(memberA2), bench)
    assert.equal(p.recommendation.kind, "TOP_OF_RANGE")
    assert.equal(p.recommendation.observation, "You reached the top of the planned rep range on every set.")
    assert.equal(p.recommendation.suggestion, "Consider a small weight increase next session.")
    assert.equal(p.recommendation.suggestedWeight, 75, "the member's own observed +2.5 step")
    assert.equal(p.planTarget?.planKind, "PERSONAL")
  })
})

describe("history is immutable", () => {
  test("editing the plan later never changes completed workouts or the planned snapshot", async () => {
    const before = await getExerciseProgress(selfTarget(memberA1), bench)
    const sessionId = before.recent.at(-1)!.workoutSessionId // 2026-10-01 session
    const sessionBefore = JSON.stringify(await getWorkoutSession(selfTarget(memberA1), sessionId))

    await updatePlannedExercise(adminA, benchItem, { sets: 5, repsMin: 3, targetWeight: 150, weightUnit: "kg", notes: "heavier" })
    const detail = await getWorkoutPlanDetail(adminA, gymPlan)
    assert.equal(detail!.days[0].exercises[0].targetWeight, 150)

    const after = await getExerciseProgress(selfTarget(memberA1), bench)
    assert.deepEqual(after.recent, before.recent, "recent sessions identical")
    assert.deepEqual(after.records, before.records)
    assert.equal(JSON.stringify(await getWorkoutSession(selfTarget(memberA1), sessionId)), sessionBefore)
    const snapshot = await ExerciseSession.findOne({ gymId: adminA.gymId, workoutSessionId: sessionId, exerciseId: bench }).lean()
    assert.equal(snapshot?.planned.targetWeight, 80, "snapshot keeps what was planned then")
    assert.equal(snapshot?.planned.sets, 3)
  })

  test("actual sets are unaffected by reading progress, and finished workouts can't be edited", async () => {
    const p = await getExerciseProgress(selfTarget(memberA1), bench)
    const target = p.recent.find((s) => s.date === "2026-10-05")!
    const sets = await SetLog.find({ gymId: adminA.gymId, workoutSessionId: target.workoutSessionId }).sort({ setNumber: 1 }).lean()
    const first = sets[0]
    await assert.rejects(() => updateSetLog(memberA1, first._id.toString(), { weight: 999, reps: 1, completed: true }), isCode("SESSION_CLOSED"))
    assert.equal((await SetLog.findOne({ gymId: adminA.gymId, _id: first._id }).lean())?.weight, 80)
  })
})

describe("explicit plan updates (never automatic)", () => {
  test("progress and recommendations never write to the plan", async () => {
    const before = JSON.stringify(await WorkoutPlanExercise.find({ gymId: adminA.gymId }).sort({ _id: 1 }).lean())
    await getExerciseProgress(selfTarget(memberA1), bench)
    await getSessionPerformance(selfTarget(memberA1), (await getExerciseProgress(selfTarget(memberA1), bench)).latest!.workoutSessionId)
    await getPerformanceHighlight(selfTarget(memberA1))
    assert.equal(JSON.stringify(await WorkoutPlanExercise.find({ gymId: adminA.gymId }).sort({ _id: 1 }).lean()), before)
  })

  test("a member cannot change a shared gym plan's target; it points to Customize", async () => {
    const info = await getPlanTargetFor(selfTarget(memberA1), bench)
    assert.equal(info?.planKind, "GYM")
    assert.equal(info?.plannedExerciseId, benchItem)
    await assert.rejects(() => setPlannedExerciseTargetWeight(memberA1, benchItem, { targetWeight: 87.5 }), isCode("NOT_FOUND"))
    assert.equal((await WorkoutPlanExercise.findOne({ gymId: adminA.gymId, _id: benchItem }).lean())?.targetWeight, 150)
  })

  test("after customizing, the member explicitly updates their own copy only", async () => {
    await customizeMyWorkoutPlan(memberA1, { startDate: "2026-11-05" })
    const info = await getPlanTargetFor(selfTarget(memberA1), bench)
    assert.equal(info?.planKind, "PERSONAL")
    assert.notEqual(info?.plannedExerciseId, benchItem)
    await setPlannedExerciseTargetWeight(memberA1, info!.plannedExerciseId, { targetWeight: "87.5", weightUnit: "kg" })
    const copy = await WorkoutPlanExercise.findOne({ gymId: adminA.gymId, _id: info!.plannedExerciseId }).lean()
    assert.equal(copy?.targetWeight, 87.5)
    assert.equal(copy?.sets, 5, "other fields unchanged")
    assert.equal((await WorkoutPlanExercise.findOne({ gymId: adminA.gymId, _id: benchItem }).lean())?.targetWeight, 150, "gym plan untouched")
    await assert.rejects(() => setPlannedExerciseTargetWeight(memberA1, info!.plannedExerciseId, { targetWeight: -5 }), isValidation("targetWeight"))
    await assert.rejects(() => setPlannedExerciseTargetWeight(memberA1, info!.plannedExerciseId, {} as never), isValidation("targetWeight"))
  })

  test("admin can't change a member's personal plan; other members and gyms can't either", async () => {
    const info = (await getPlanTargetFor(selfTarget(memberA1), bench))!
    await assert.rejects(() => setPlannedExerciseTargetWeight(adminA, info.plannedExerciseId, { targetWeight: 1 }), isCode("NOT_FOUND"))
    await assert.rejects(() => setPlannedExerciseTargetWeight(memberA2, info.plannedExerciseId, { targetWeight: 1 }), isCode("NOT_FOUND"))
    await assert.rejects(() => setPlannedExerciseTargetWeight(adminB, benchItem, { targetWeight: 1 }), isCode("NOT_FOUND"))
    await assert.rejects(() => setPlannedExerciseTargetWeight(memberB1, benchItem, { targetWeight: 1 }), isCode("NOT_FOUND"))
    // but an admin may explicitly edit their own gym plan's target
    await setPlannedExerciseTargetWeight(adminA, benchItem, { targetWeight: 90 })
    assert.equal((await WorkoutPlanExercise.findOne({ gymId: adminA.gymId, _id: benchItem }).lean())?.targetWeight, 90)
  })
})

describe("security", () => {
  test("members only see their own performance", async () => {
    // A2 has bench history of their own, with different numbers.
    const a2 = await getExerciseProgress(selfTarget(memberA2), bench)
    const a1 = await getExerciseProgress(selfTarget(memberA1), bench)
    assert.equal(a2.sessionCount, 3)
    assert.equal(a2.records.highestWeight?.value, 72.5)
    assert.equal(a1.records.highestWeight?.value, 205)
    assert.ok(a2.recent.every((s) => !a1.recent.some((x) => x.workoutSessionId === s.workoutSessionId)))
    assert.deepEqual(await listProgressExercises(selfTarget(memberB1)), [])
    assert.equal((await getExerciseProgress(selfTarget(memberB1), bench)).sessionCount, 0, "another gym's member, same exercise id")
    const sessionOfA1 = (await getExerciseProgress(selfTarget(memberA1), bench)).latest!.workoutSessionId
    assert.deepEqual(await getSessionPerformance(selfTarget(memberA2), sessionOfA1), [])
    assert.deepEqual(await getSessionPerformance(selfTarget(memberB1), sessionOfA1), [])
  })

  test("a gym admin reads only their own gym's members", async () => {
    const view = await getExerciseProgress(await gymMemberTarget(adminA, memberA1.id), bench)
    assert.equal(view.records.highestWeight?.value, 205)
    await assert.rejects(() => gymMemberTarget(adminB, memberA1.id), isCode("NOT_FOUND"))
    await assert.rejects(() => gymMemberTarget(adminA, memberB1.id), isCode("NOT_FOUND"))
    await assert.rejects(() => gymMemberTarget(adminA, adminA.id), isCode("NOT_FOUND"), "an admin is not a member")
  })

  test("super admin reads through a read-only platform target", async () => {
    const target = await platformMemberTarget(superAdmin, memberA1.id)
    assert.equal(target.writable, false)
    assert.equal((await getExerciseProgress(target, bench)).records.highestWeight?.value, 205)
  })

  test("forged ids fail or reveal nothing", async () => {
    await assert.rejects(() => getExerciseProgress(selfTarget(memberA1), "not-an-id"), isValidation())
    await assert.rejects(() => getExerciseProgress(selfTarget(memberA1), { $ne: null } as never), isValidation())
    await assert.rejects(() => getSessionPerformance(selfTarget(memberA1), "x"), isValidation())
    assert.equal((await getExerciseProgress(selfTarget(memberA1), "000000000000000000000000")).sessionCount, 0)
    // client-supplied member ids are impossible: targets only come from the server resolvers
    assert.equal(selfTarget({ ...memberA1, id: memberA1.id }).memberId, memberA1.id)
  })
})

describe("dates", () => {
  test("the supplied calendar day is preserved regardless of the server's UTC clock", async () => {
    mock.timers.enable({ apis: ["Date"], now: new Date("2026-12-31T23:30:00Z") })
    let id: string
    try {
      id = await workout(memberA2, "2027-01-01", [[75, 8], [75, 8], [75, 8]], a2Day)
    } finally {
      mock.timers.reset()
    }
    const p = await getExerciseProgress(selfTarget(memberA2), bench)
    assert.equal(p.latest?.date, "2027-01-01")
    assert.equal(p.latest?.workoutSessionId, id)
    assert.equal(p.latest?.startedAt, "2026-12-31T23:30:00.000Z", "the timestamp stays the real instant")
  })

  test("no calendar day is derived by the server: filters are explicit or absent", async () => {
    const all = await getExerciseProgress(selfTarget(memberA2), bench)
    const ranged = await getExerciseProgress(selfTarget(memberA2), bench, { from: "2027-01-01", to: "2027-01-01" })
    assert.equal(all.recent.length, 4)
    assert.deepEqual(ranged.recent.map((s) => s.date), ["2027-01-01"])
  })
})
