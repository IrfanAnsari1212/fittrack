import type { DefaultSession } from "next-auth"

import type { Role } from "@/lib/auth/roles"

declare module "next-auth" {
  interface User {
    role: Role
    gymId: string | null
  }

  interface Session {
    user: {
      id: string
      role: Role
      gymId: string | null
    } & DefaultSession["user"]
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string
    role: Role
    gymId: string | null
  }
}
