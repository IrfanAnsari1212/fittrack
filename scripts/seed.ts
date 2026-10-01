/**
 * Seed fake development data: 1 Super Admin, Gym A and Gym B, each with a
 * Gym Admin and two members.
 *
 *   npm run db:seed                    # local databases only
 *   npm run db:seed -- --allow-remote  # e.g. a dev Atlas cluster
 *
 * Refuses to run with NODE_ENV=production. Idempotent: existing accounts
 * (matched by email) are skipped, nothing is deleted.
 */
import { loadEnv } from "./lib/load-env"
import { DEV_PASSWORD_DEFAULT, devAccounts, seedDevelopmentData } from "./lib/seed-data"
import { disconnectFromDatabase } from "@/server/db/connect"

loadEnv()

function isLocalUri(uri: string) {
  return /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(uri)
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed with NODE_ENV=production.")
  }
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error("MONGODB_URI is not set (see .env.example).")
  if (!isLocalUri(uri) && !process.argv.includes("--allow-remote")) {
    throw new Error(
      "MONGODB_URI is not a local database. Re-run with --allow-remote if this is a development cluster."
    )
  }

  const password = process.env.SEED_PASSWORD || DEV_PASSWORD_DEFAULT
  const result = await seedDevelopmentData(password)

  console.log(`\nCreated: ${result.created.length}, skipped (already existed): ${result.skipped.length}`)
  console.log(`\nAll seed accounts use the password: ${password}\n`)
  console.table([
    { role: "SUPER_ADMIN", gym: "—", email: devAccounts.superAdmin.email },
    ...devAccounts.gyms.flatMap((gym) => [
      { role: "GYM_ADMIN", gym: gym.gymName, email: gym.admin.email },
      ...gym.members.map((m) => ({ role: "MEMBER", gym: gym.gymName, email: m.email })),
    ]),
  ])
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => disconnectFromDatabase())
