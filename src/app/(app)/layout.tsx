import { AppShell } from "@/components/layout/app-shell"

/**
 * Layout for all signed-in routes. When auth is added, the session check /
 * redirect belongs here (or in `proxy.ts`), not in individual pages.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>
}
