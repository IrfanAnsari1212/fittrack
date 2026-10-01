import bcrypt from "bcryptjs"

const SALT_ROUNDS = 12

export function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

let dummyHash: Promise<string> | undefined

/**
 * Compare against a throwaway hash when the email doesn't exist so login
 * takes the same time either way (prevents account enumeration by timing).
 */
export async function burnPasswordCheck(password: string) {
  dummyHash ??= bcrypt.hash("fittrack-timing-equalizer", SALT_ROUNDS)
  await bcrypt.compare(password, await dummyHash)
}
