import { connectToDatabase } from "@/server/db/connect"
import { dbReady } from "@/server/db"
import { hashPassword } from "@/server/auth/password"
import { crossTenant } from "@/server/db/tenant-guard"
import { Gym } from "@/server/models/gym"
import { User } from "@/server/models/user"
import { createGymWithAdmin } from "@/server/services/gym-service"
import { createMember } from "@/server/services/member-service"
import type { GymAdminUser, SuperAdminUser } from "@/types/auth"

/**
 * Clearly fake development accounts for testing tenant isolation.
 * `.test` is a reserved TLD, so these addresses can never receive mail.
 */
export const DEV_PASSWORD_DEFAULT = "FitTrack-dev-only-123"

export const devAccounts = {
  superAdmin: { name: "Sam Super (dev)", email: "superadmin@fittrack.test" },
  gyms: [
    {
      key: "A",
      gymName: "Dev Gym A",
      admin: { name: "Alice Admin (Gym A)", email: "admin.a@fittrack.test" },
      members: [
        { name: "Andy Member (A1)", email: "member.a1@fittrack.test" },
        { name: "Amara Member (A2)", email: "member.a2@fittrack.test" },
      ],
    },
    {
      key: "B",
      gymName: "Dev Gym B",
      admin: { name: "Ben Admin (Gym B)", email: "admin.b@fittrack.test" },
      members: [
        { name: "Bella Member (B1)", email: "member.b1@fittrack.test" },
        { name: "Bruno Member (B2)", email: "member.b2@fittrack.test" },
      ],
    },
  ],
} as const

export interface SeedResult {
  created: string[]
  skipped: string[]
}

/** Idempotent: existing accounts (by email) are left untouched. */
export async function seedDevelopmentData(password: string): Promise<SeedResult> {
  await connectToDatabase()
  await dbReady()
  const result: SeedResult = { created: [], skipped: [] }
  const findByEmail = (email: string) => crossTenant(User.findOne({ email })).lean()

  let superAdmin = await findByEmail(devAccounts.superAdmin.email)
  if (superAdmin) {
    result.skipped.push(devAccounts.superAdmin.email)
  } else {
    await User.create({
      ...devAccounts.superAdmin,
      passwordHash: await hashPassword(password),
      role: "SUPER_ADMIN",
      gymId: null,
      status: "ACTIVE",
    })
    superAdmin = await findByEmail(devAccounts.superAdmin.email)
    result.created.push(devAccounts.superAdmin.email)
  }
  if (!superAdmin) throw new Error("Super admin missing after seed")

  const superCtx: SuperAdminUser = {
    id: superAdmin._id.toString(),
    name: superAdmin.name,
    email: superAdmin.email,
    image: null,
    role: "SUPER_ADMIN",
    gymId: null,
    gymName: null,
  }

  for (const gym of devAccounts.gyms) {
    let admin = await findByEmail(gym.admin.email)
    if (admin) {
      result.skipped.push(gym.admin.email)
    } else {
      await createGymWithAdmin(superCtx, {
        gymName: gym.gymName,
        adminName: gym.admin.name,
        adminEmail: gym.admin.email,
        adminPassword: password,
      })
      admin = await findByEmail(gym.admin.email)
      result.created.push(gym.admin.email)
    }
    if (!admin?.gymId) throw new Error(`Gym admin ${gym.admin.email} has no gym`)

    const gymDoc = await Gym.findOne({ _id: admin.gymId }).lean()
    const adminCtx: GymAdminUser = {
      id: admin._id.toString(),
      name: admin.name,
      email: admin.email,
      image: null,
      role: "GYM_ADMIN",
      gymId: admin.gymId.toString(),
      gymName: gymDoc?.name ?? gym.gymName,
    }

    for (const member of gym.members) {
      if (await findByEmail(member.email)) {
        result.skipped.push(member.email)
        continue
      }
      await createMember(adminCtx, {
        name: member.name,
        email: member.email,
        password,
        phone: null,
        dateOfBirth: null,
        notes: "Development seed account",
      })
      result.created.push(member.email)
    }
  }

  return result
}
