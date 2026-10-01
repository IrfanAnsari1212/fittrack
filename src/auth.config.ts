import type { NextAuthConfig } from "next-auth"

/**
 * Database-free Auth.js config, shared by `auth.ts` (full, with providers)
 * and `proxy.ts` (which only needs to read the session cookie).
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      // `user` is only present right after sign-in.
      if (user?.id) {
        token.id = user.id
        token.role = user.role
        token.gymId = user.gymId
      }
      return token
    },
    session({ session, token }) {
      // Expose only what the UI needs. Never anything from the DB record.
      session.user.id = token.id
      session.user.role = token.role
      session.user.gymId = token.gymId
      return session
    },
  },
} satisfies NextAuthConfig
