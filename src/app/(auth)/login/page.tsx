import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { LoginForm } from "@/components/auth/login-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { homePathFor } from "@/lib/auth/roles"
import { safeCallbackPath } from "@/lib/auth/route-access"
import { getCurrentUser } from "@/server/auth/session"

export const metadata: Metadata = { title: "Log in" }

const errorMessages: Record<string, string> = {
  account_unavailable: "This account or its gym is not active. Please contact your gym.",
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser()
  if (user) redirect(homePathFor(user.role))

  const params = await searchParams
  const callbackUrl = safeCallbackPath(params.callbackUrl) ?? undefined
  const error = typeof params.error === "string" ? errorMessages[params.error] : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          <h1>Welcome back</h1>
        </CardTitle>
        <CardDescription>Log in to your FitTrack account.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm callbackUrl={callbackUrl} initialError={error} />
      </CardContent>
      <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
        New to FitTrack?
        <Link
          href="/register"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          How to get an account
        </Link>
      </CardFooter>
    </Card>
  )
}
