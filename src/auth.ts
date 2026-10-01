import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"

import { authConfig } from "@/auth.config"
import { loginSchema } from "@/lib/validations/schemas"
import { verifyCredentials } from "@/server/auth/account"

class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials"
}

class AccountUnavailableError extends CredentialsSignin {
  code = "account_unavailable"
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw)
        if (!parsed.success) throw new InvalidCredentialsError()

        const result = await verifyCredentials(parsed.data.email, parsed.data.password)
        if (!result.ok) {
          // "inactive" is only reported after the password matched.
          throw result.reason === "inactive"
            ? new AccountUnavailableError()
            : new InvalidCredentialsError()
        }

        const { id, name, email, image, role, gymId } = result.user
        return { id, name, email, image, role, gymId }
      },
    }),
  ],
})
