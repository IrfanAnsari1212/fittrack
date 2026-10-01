import { requireSuperAdmin } from "@/server/auth/session"

/** Platform owner area. Pages and actions still check `requireSuperAdmin()` themselves. */
export default async function SuperAdminLayout({ children }: LayoutProps<"/super-admin">) {
  await requireSuperAdmin()
  return children
}
