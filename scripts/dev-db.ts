/**
 * Throwaway local MongoDB replica set for development (no install needed).
 * Data lives in memory and is lost when you stop this process.
 *
 *   npm run db:dev
 *   # then set MONGODB_URI=mongodb://127.0.0.1:27018/fittrack?replicaSet=rs0
 *   # and run: npm run db:seed
 */
import { MongoMemoryReplSet } from "mongodb-memory-server"

const PORT = 27018

async function main() {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: "rs0", storageEngine: "wiredTiger" },
    instanceOpts: [{ port: PORT, launchTimeout: 60_000 }],
  })
  const uri = `mongodb://127.0.0.1:${PORT}/fittrack?replicaSet=rs0`
  console.log(`\nLocal MongoDB replica set running (in-memory).\n\n  MONGODB_URI=${uri}\n\nPress Ctrl+C to stop.\n`)

  const stop = async () => {
    await replSet.stop()
    process.exit(0)
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
