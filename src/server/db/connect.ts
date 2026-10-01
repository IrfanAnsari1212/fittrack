import mongoose from "mongoose"

/**
 * Reuse one connection across hot reloads and serverless invocations by
 * caching the connection promise on `globalThis`.
 */
const globalForMongoose = globalThis as unknown as {
  mongooseConnection?: Promise<typeof mongoose>
}

export function connectToDatabase() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local.")
  }

  globalForMongoose.mongooseConnection ??= mongoose
    .connect(uri, { bufferCommands: false })
    .catch((error: unknown) => {
      // Allow the next call to retry instead of caching a failed promise.
      globalForMongoose.mongooseConnection = undefined
      throw error
    })

  return globalForMongoose.mongooseConnection
}

export async function disconnectFromDatabase() {
  globalForMongoose.mongooseConnection = undefined
  await mongoose.disconnect()
}
