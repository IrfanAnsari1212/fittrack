import { Logo } from "@/components/common/logo"
import { NavLinks } from "@/components/navigation/nav-links"

/** Desktop sidebar. On small screens navigation moves into `MobileNav`. */
export function AppSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-16 items-center px-6">
        <Logo href="/dashboard" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks />
      </div>
    </aside>
  )
}
