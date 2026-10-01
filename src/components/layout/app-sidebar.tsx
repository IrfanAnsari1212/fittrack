import { Logo } from "@/components/common/logo"
import { NavLinks } from "@/components/navigation/nav-links"
import { homePathFor, type Role } from "@/lib/auth/roles"

/** Desktop sidebar. On small screens navigation moves into `MobileNav`. */
export function AppSidebar({ role, contextLabel }: { role: Role; contextLabel: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-16 items-center px-6">
        <Logo href={homePathFor(role)} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks role={role} />
      </div>
      <div className="border-t border-sidebar-border px-6 py-4">
        <p className="truncate text-xs text-muted-foreground">{contextLabel}</p>
      </div>
    </aside>
  )
}
