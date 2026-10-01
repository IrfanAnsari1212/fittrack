import mongoose from "mongoose"

import { dbReady } from "@/server/db"
import { DomainError, isDuplicateKeyError } from "@/server/errors"

/**
 * Run `work` in a MongoDB transaction (replica set required). A duplicate-key
 * race (e.g. the one-active-assignment index) surfaces as `CONFLICT`.
 */
export async function inTransaction<T>(work: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
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
