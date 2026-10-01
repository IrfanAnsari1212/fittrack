import { Logo } from "@/components/common/logo"
import { MobileNav } from "@/components/layout/mobile-nav"
import { NotificationsButton } from "@/components/layout/notifications-button"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { UserMenu, type UserMenuUser } from "@/components/layout/user-menu"
import { homePathFor, type Role } from "@/lib/auth/roles"

export function AppHeader({ role, user }: { role: Role; user: UserMenuUser }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-backdrop-filter:bg-background/60 sm:px-6">
      <MobileNav role={role} />
      <Logo href={homePathFor(role)} className="lg:hidden" />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <NotificationsButton />
        <UserMenu user={user} />
      </div>
    </header>
  )
}
