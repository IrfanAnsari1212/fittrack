import { existsSync } from "node:fs"

/** Load .env.local / .env for standalone scripts (Next.js does this itself). */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file)
  }
}
