import NextAuth from "next-auth"
import { NextResponse } from "next/server"

import { authConfig } from "@/auth.config"
import { findRouteRule } from "@/lib/auth/route-access"

/**
 * Optimistic route protection (fast redirects, real 401/403 semantics).
 * Reads only the signed session cookie, never the database. Authoritative
 * checks still happen in the Data Access Layer inside every page and action.
 */
const { auth } = NextAuth(authConfig)

export const proxy = auth((request) => {
  const { pathname, search } = request.nextUrl
  const rule = findRouteRule(pathname)
  if (!rule) return NextResponse.next()

  const user = request.auth?.user
  if (!user?.id) {
    const loginUrl = new URL("/login", request.nextUrl)
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  if (!rule.roles.includes(user.role)) {
    return NextResponse.rewrite(new URL("/forbidden", request.nextUrl), { status: 403 })
  }

  return NextResponse.next()
})

export const config = {
  // Skip API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
