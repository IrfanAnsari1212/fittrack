import { connectToDatabase } from "@/server/db/connect"
import { Gym } from "@/server/models/gym"
import { User } from "@/server/models/user"

/**
 * Connect and make sure indexes exist before use. Unique indexes (email,
 * slug) must exist before transactions rely on them. `init()` is memoized
 * by Mongoose, so calling this on every request is cheap.
 */
export async function dbReady() {
  await connectToDatabase()
  await Promise.all([Gym.init(), User.init()])
}
