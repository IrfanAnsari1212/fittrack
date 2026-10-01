import type { Metadata } from "next"
import Link from "next/link"
import { ShieldX } from "lucide-react"

import { Logo } from "@/components/common/logo"
import { Button } from "@/components/ui/button"
import { homePathFor } from "@/lib/auth/roles"
import { getCurrentUser } from "@/server/auth/session"

export const metadata: Metadata = { title: "Access denied" }

/** Shown (with HTTP 403 via proxy) when a signed-in user lacks access. */
export default async function ForbiddenPage() {
  const user = await getCurrentUser()
  const home = user ? homePathFor(user.role) : "/login"

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/30 px-4 py-12 text-center">
      <Logo />
      <div className="max-w-sm space-y-3">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldX className="size-6" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          You don&apos;t have permission to view this page.
        </p>
      </div>
      <Button nativeButton={false} render={<Link href={home} />}>
        {user ? "Go to your dashboard" : "Log in"}
      </Button>
    </div>
  )
}
