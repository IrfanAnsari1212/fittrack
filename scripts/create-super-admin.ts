/**
 * Create a platform Super Admin account (the first one, or an additional one).
 *
 *   npm run create-super-admin
 *
 * Prompts for name, email and password (hidden). Uses MONGODB_URI from
 * .env.local. Refuses if the email is already registered.
 */
import { createInterface } from "node:readline"
import { Writable } from "node:stream"

import { z } from "zod"

import { emailSchema, nameSchema, newPasswordSchema } from "@/lib/validations/common"
import { hashPassword } from "@/server/auth/password"
import { dbReady } from "@/server/db"
import { disconnectFromDatabase } from "@/server/db/connect"
import { isDuplicateKeyError } from "@/server/errors"
import { User } from "@/server/models/user"

import { loadEnv } from "./lib/load-env"

loadEnv()

/** Output stream that can be muted while a password is typed. */
let muted = false
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk)
    callback()
  },
})
const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY })

// Buffer lines so piped (non-TTY) input works as well as typed input.
const lines: string[] = []
const waiters: ((line: string) => void)[] = []
rl.on("line", (line) => (waiters.length ? waiters.shift()!(line) : lines.push(line)))

function ask(question: string, { hidden = false } = {}): Promise<string> {
  process.stdout.write(question)
  muted = hidden
  return new Promise((resolve) => {
    const done = (line: string) => {
      if (hidden) {
        muted = false
        process.stdout.write("\n")
      }
      resolve(line.trim())
    }
    if (lines.length) done(lines.shift()!)
    else waiters.push(done)
  })
}

async function askValid<T>(question: string, schema: z.ZodType<T>, hidden = false): Promise<T> {
  for (;;) {
    const result = schema.safeParse(await ask(question, { hidden }))
    if (result.success) return result.data
    console.log(`  ✗ ${result.error.issues[0]?.message ?? "Invalid value"}`)
  }
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set (see .env.example).")

  console.log("Create a FitTrack Super Admin\n")
  const name = await askValid("Name: ", nameSchema)
  const email = await askValid("Email: ", emailSchema)
  let password: string
  for (;;) {
    password = await askValid("Password (min 8 chars): ", newPasswordSchema, true)
    if ((await ask("Confirm password: ", { hidden: true })) === password) break
    console.log("  ✗ Passwords don't match")
  }

  await dbReady()
  try {
    await User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "SUPER_ADMIN",
      gymId: null,
      status: "ACTIVE",
    })
  } catch (error) {
    if (isDuplicateKeyError(error, "email")) {
      throw new Error(`An account with ${email} already exists. Nothing was changed.`)
    }
    throw error
  }
  console.log(`\n✓ Super Admin created: ${email}\n  Log in at /login — you'll land on /super-admin.`)
}

main()
  .catch((error: unknown) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
  .finally(async () => {
    rl.close()
    await disconnectFromDatabase()
  })
