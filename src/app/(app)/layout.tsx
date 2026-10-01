import { AppShell } from "@/components/layout/app-shell"
import { requireAuth } from "@/server/auth/session"

/**
 * Shell for every signed-in route. The check here only decides what chrome
 * to render; each page and server action still calls its own `require*`
 * helper, because layouts don't re-run on client-side navigation.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireAuth()
  return <AppShell user={user}>{children}</AppShell>
}
