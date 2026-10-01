import { requireGymAdmin } from "@/server/auth/session"

/** Gym Admin area. Pages and actions still check `requireGymAdmin()` themselves. */
export default async function GymAdminLayout({ children }: LayoutProps<"/admin">) {
  await requireGymAdmin()
  return children
}
