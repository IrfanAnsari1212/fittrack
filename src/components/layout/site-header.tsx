import Link from "next/link"

import { Logo } from "@/components/common/logo"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Button } from "@/components/ui/button"

/** Header for public (marketing) pages. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            className="hidden sm:inline-flex"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Log in
          </Button>
          <Button nativeButton={false} render={<Link href="/register" />}>
            Get an account
          </Button>
        </div>
      </div>
    </header>
  )
}
