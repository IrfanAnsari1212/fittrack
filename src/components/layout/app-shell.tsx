import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { roleLabels } from "@/lib/auth/roles"
import type { SessionUser } from "@/types/auth"

/** Authenticated-app chrome: sidebar + header + scrollable content area. */
export function AppShell({
  user,
  children,
}: {
  user: SessionUser
  children: React.ReactNode
}) {
  const contextLabel = user.gymName ?? "FitTrack Platform"
  const menuUser = {
    name: user.name,
    email: user.email,
    image: user.image,
    roleLabel: user.gymName
      ? `${roleLabels[user.role]} · ${user.gymName}`
      : roleLabels[user.role],
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>
      <AppSidebar role={user.role} contextLabel={contextLabel} />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <AppHeader role={user.role} user={menuUser} />
        <main
          id="main-content"
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
