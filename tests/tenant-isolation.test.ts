/**
 * Service-level security tests: tenant isolation, credential checks and
 * gym creation, against a throwaway in-memory MongoDB replica set.
 *
 *   npm test
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

import { MongoMemoryReplSet } from "mongodb-memory-server"

import { createMemberSchema } from "@/lib/validations/schemas"
import { loadSessionUser, verifyCredentials } from "@/server/auth/account"
import { ForbiddenError } from "@/server/auth/guards"
import { disconnectFromDatabase } from "@/server/db/connect"
import { crossTenant, TenantScopeError } from "@/server/db/tenant-guard"
import { DomainError } from "@/server/errors"
import { Gym } from "@/server/models/gym"
import { User } from "@/server/models/user"
import { createGymWithAdmin } from "@/server/services/gym-service"
import {
  createMember,
  getMember,
  listMembers,
  setMemberStatus,
  updateMember,
} from "@/server/services/member-service"
import { getOwnProfile, updateOwnProfile } from "@/server/services/profile-service"
import { getPlatformStats, listAllUsers, listGyms } from "@/server/services/platform-service"
import type { GymAdminUser, MemberUser, SessionUser, SuperAdminUser } from "@/types/auth"

import { devAccounts, seedDevelopmentData } from "../scripts/lib/seed-data"

const PASSWORD = "test-password-123"
let replSet: MongoMemoryReplSet

/** Build the same context the Data Access Layer would, from the DB. */
async function contextFor(email: string): Promise<SessionUser> {
  const user = await crossTenant(User.findOne({ email })).lean()
  assert.ok(user, `missing seeded user ${email}`)
  const result = await loadSessionUser(user._id.toString())
  assert.ok(result.ok, `user ${email} should be active`)
  return result.user
}

const [gymA, gymB] = devAccounts.gyms
let superAdmin: SuperAdminUser
let adminA: GymAdminUser
let adminB: GymAdminUser
let memberA1: MemberUser
let memberA2: MemberUser
let memberB1: MemberUser

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ launchTimeout: 60_000 }],
  })
  process.env.MONGODB_URI = replSet.getUri("fittrack-test")
  await seedDevelopmentData(PASSWORD)

  superAdmin = (await contextFor(devAccounts.superAdmin.email)) as SuperAdminUser
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

describe("database records", () => {
  test("gyms are created with the admin as owner, and users carry the right gymId/role", async () => {
    for (const [admin, members] of [
      [adminA, [memberA1, memberA2]],
      [adminB, [memberB1]],
    ] as const) {
      const gym = await Gym.findOne({ _id: admin.gymId }).lean()
      assert.ok(gym)
      assert.equal(gym.ownerId.toString(), admin.id, "gym.ownerId → gym admin")
      assert.equal(gym.status, "ACTIVE")
      assert.equal(gym.subscription?.plan, "TRIAL")
      assert.equal(admin.role, "GYM_ADMIN")
      for (const member of members) {
        assert.equal(member.role, "MEMBER")
        assert.equal(member.gymId, admin.gymId)
      }
    }
    assert.notEqual(adminA.gymId, adminB.gymId)
    assert.equal(superAdmin.role, "SUPER_ADMIN")
    assert.equal(superAdmin.gymId, null)
  })

  test("passwords are stored as bcrypt hashes and hidden by default", async () => {
    const withHash = await crossTenant(User.findOne({ email: gymA.admin.email }))
      .select("+passwordHash")
      .lean()
    assert.ok(withHash?.passwordHash.startsWith("$2"), "bcrypt hash")
    assert.notEqual(withHash?.passwordHash, PASSWORD)

    const plain = await crossTenant(User.findOne({ email: gymA.admin.email })).lean()
    assert.equal((plain as Record<string, unknown>).passwordHash, undefined)
  })

  test("emails are globally unique across gyms", async () => {
    await assert.rejects(
      createMember(adminB, {
        name: "Duplicate",
        email: gymA.members[0].email,
        password: PASSWORD,
        phone: null,
        dateOfBirth: null,
        notes: null,
      }),
      (error: unknown) => error instanceof DomainError && error.code === "EMAIL_TAKEN"
    )
  })

  test("gym creation is atomic: a failed admin insert leaves no orphan gym", async () => {
    const gymsBefore = await Gym.countDocuments({})
    await assert.rejects(
      createGymWithAdmin(superAdmin, {
        gymName: "Should Roll Back",
        adminName: "Taken Email",
        adminEmail: gymB.admin.email, // already exists → unique index violation
        adminPassword: PASSWORD,
      }),
      (error: unknown) => error instanceof DomainError && error.code === "EMAIL_TAKEN"
    )
    assert.equal(await Gym.countDocuments({}), gymsBefore)
    assert.equal(await Gym.exists({ name: "Should Roll Back" }), null)
  })
})

describe("tenant isolation (Gym Admin)", () => {
  test("Case 5: each admin lists only their own gym's members", async () => {
    const aEmails = (await listMembers(adminA)).map((m) => m.email).sort()
    const bEmails = (await listMembers(adminB)).map((m) => m.email).sort()
    assert.deepEqual(aEmails, gymA.members.map((m) => m.email).sort())
    assert.deepEqual(bEmails, gymB.members.map((m) => m.email).sort())
  })

  test("search stays inside the tenant and treats input as literal text", async () => {
    const hits = await listMembers(adminA, { query: "member" })
    assert.ok(hits.every((m) => m.email.includes(".a")), "no Gym B results")
    assert.deepEqual(await listMembers(adminA, { query: "Bella" }), [])
    assert.deepEqual(await listMembers(adminA, { query: ".*" }), [])
  })

  test("Case 6: an admin cannot read, edit or disable another gym's member", async () => {
    assert.equal(await getMember(adminA, memberB1.id), null)
    assert.equal(await getMember(adminB, memberA1.id), null)
    assert.ok(await getMember(adminA, memberA1.id), "own member is visible")

    await assert.rejects(
      updateMember(adminA, memberB1.id, {
        name: "Hijacked",
        email: "hijacked@fittrack.test",
        phone: null,
        dateOfBirth: null,
        notes: null,
      }),
      (error: unknown) => error instanceof DomainError && error.code === "NOT_FOUND"
    )
    await assert.rejects(
      setMemberStatus(adminA, memberB1.id, "DISABLED"),
      (error: unknown) => error instanceof DomainError && error.code === "NOT_FOUND"
    )
    const b1 = await crossTenant(User.findOne({ _id: memberB1.id })).lean()
    assert.equal(b1?.name, memberB1.name)
    assert.equal(b1?.status, "ACTIVE")
  })

  test("an admin cannot use member tools on admins (role is part of the scope)", async () => {
    assert.equal(await getMember(adminA, adminA.id), null)
    await assert.rejects(setMemberStatus(adminA, adminA.id, "DISABLED"))
  })

  test("malformed ids are rejected without errors leaking", async () => {
    assert.equal(await getMember(adminA, "not-an-id"), null)
    assert.equal(await getMember(adminA, '{"$ne":null}'), null)
  })

  test("Case 7: a client-supplied gymId is stripped by the schema and ignored by the service", async () => {
    const forged = {
      name: "Forged Gym Member",
      email: "forged@fittrack.test",
      password: PASSWORD,
      gymId: adminB.gymId,
      role: "SUPER_ADMIN",
    }

    const parsed = createMemberSchema.parse(forged)
    assert.equal("gymId" in parsed, false, "schema strips gymId")
    assert.equal("role" in parsed, false, "schema strips role")

    // Even if a caller bypassed the schema, the service ignores it.
    const { id } = await createMember(adminA, forged as never)
    const created = await crossTenant(User.findOne({ _id: id })).lean()
    assert.equal(created?.gymId?.toString(), adminA.gymId)
    assert.equal(created?.role, "MEMBER")
    assert.equal(await getMember(adminB, id), null)
  })

  test("services reject a context with the wrong role", async () => {
    await assert.rejects(listMembers(memberA1 as unknown as GymAdminUser), ForbiddenError)
    await assert.rejects(
      createGymWithAdmin(adminA as unknown as SuperAdminUser, {
        gymName: "Nope",
        adminName: "Nope",
        adminEmail: "nope@fittrack.test",
        adminPassword: PASSWORD,
      }),
      ForbiddenError
    )
  })
})

describe("tenant isolation (Member)", () => {
  test("a member's profile access is limited to themselves", async () => {
    const own = await getOwnProfile(memberA1)
    assert.equal(own.email, memberA1.email)

    // A forged context pointing at another gym's user id with the wrong gym
    // matches nothing: the self filter requires id AND gymId.
    await assert.rejects(
      updateOwnProfile({ ...memberA1, id: memberB1.id }, { name: "X", phone: null }),
      (error: unknown) => error instanceof DomainError && error.code === "NOT_FOUND"
    )
    const b1 = await crossTenant(User.findOne({ _id: memberB1.id })).lean()
    assert.equal(b1?.name, memberB1.name)

    await updateOwnProfile(memberA2, { name: "Amara Updated", phone: "555-0100" })
    const a2 = await getOwnProfile(memberA2)
    assert.equal(a2.name, "Amara Updated")
  })
})

describe("tenant guard plugin", () => {
  test("unscoped queries on tenant models throw", async () => {
    await assert.rejects(User.find({ role: "MEMBER" }).lean(), TenantScopeError)
    await assert.rejects(User.findOne({ _id: memberA1.id }).lean(), TenantScopeError)
    await assert.rejects(User.countDocuments({}), TenantScopeError)
    await assert.rejects(User.updateMany({}, { $set: { status: "DISABLED" } }), TenantScopeError)
    await assert.rejects(User.deleteMany({}), TenantScopeError)
  })

  test("explicit crossTenant() queries are allowed", async () => {
    const count = await crossTenant(User.countDocuments({}))
    assert.ok(count >= 7)
  })
})

describe("authentication", () => {
  test("valid credentials return a safe session payload", async () => {
    const result = await verifyCredentials(gymA.members[0].email.toUpperCase(), PASSWORD)
    assert.ok(result.ok)
    assert.deepEqual(Object.keys(result.user).sort(), [
      "email",
      "gymId",
      "gymName",
      "id",
      "image",
      "name",
      "role",
    ])
    assert.equal(result.user.role, "MEMBER")
    assert.equal(result.user.gymId, adminA.gymId)
  })

  test("wrong password and unknown email are both 'invalid'", async () => {
    assert.deepEqual(await verifyCredentials(gymA.members[0].email, "wrong-password"), {
      ok: false,
      reason: "invalid",
    })
    assert.deepEqual(await verifyCredentials("nobody@fittrack.test", PASSWORD), {
      ok: false,
      reason: "invalid",
    })
  })

  test("disabled users cannot log in and their existing sessions stop working", async () => {
    await setMemberStatus(adminB, memberB1.id, "DISABLED")
    assert.deepEqual(await verifyCredentials(memberB1.email, PASSWORD), {
      ok: false,
      reason: "inactive",
    })
    assert.deepEqual(await loadSessionUser(memberB1.id), { ok: false, reason: "inactive" })

    await setMemberStatus(adminB, memberB1.id, "ACTIVE")
    assert.ok((await verifyCredentials(memberB1.email, PASSWORD)).ok)
  })

  test("users of a suspended gym are locked out; other gyms are unaffected", async () => {
    await Gym.updateOne({ _id: adminB.gymId }, { $set: { status: "SUSPENDED" } })
    assert.equal((await verifyCredentials(gymB.admin.email, PASSWORD)).ok, false)
    assert.equal((await loadSessionUser(memberB1.id)).ok, false)
    assert.ok((await verifyCredentials(gymA.admin.email, PASSWORD)).ok)
    await Gym.updateOne({ _id: adminB.gymId }, { $set: { status: "ACTIVE" } })
  })
})

describe("super admin (platform)", () => {
  test("lists every gym with its owner and member counts", async () => {
    const gyms = await listGyms(superAdmin)
    const a = gyms.find((g) => g.id === adminA.gymId)
    const b = gyms.find((g) => g.id === adminB.gymId)
    assert.equal(a?.ownerEmail, gymA.admin.email)
    assert.equal(b?.ownerEmail, gymB.admin.email)
    assert.equal(b?.memberCount, 2)
    assert.equal(a?.adminCount, 1)
  })

  test("lists users across gyms and computes platform stats", async () => {
    const users = await listAllUsers(superAdmin)
    assert.ok(users.some((u) => u.email === gymA.members[0].email && u.gymName === gymA.gymName))
    assert.ok(users.some((u) => u.email === gymB.members[0].email && u.gymName === gymB.gymName))
    const stats = await getPlatformStats(superAdmin)
    assert.equal(stats.gymAdmins, 2)
    assert.ok(stats.gyms >= 2)
  })

  test("platform services refuse non-super-admin contexts", async () => {
    await assert.rejects(listAllUsers(adminA as unknown as SuperAdminUser), ForbiddenError)
    await assert.rejects(listGyms(memberA1 as unknown as SuperAdminUser), ForbiddenError)
  })
})
