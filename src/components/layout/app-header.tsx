import { Logo } from "@/components/common/logo"
import { MobileNav } from "@/components/layout/mobile-nav"
import { NotificationsButton } from "@/components/layout/notifications-button"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { UserMenu } from "@/components/layout/user-menu"

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-backdrop-filter:bg-background/60 sm:px-6">
      <MobileNav />
      <Logo href="/dashboard" className="lg:hidden" />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <NotificationsButton />
        <UserMenu />
      </div>
    </header>
  )
}
