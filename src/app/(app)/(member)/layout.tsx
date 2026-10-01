import { requireMember } from "@/server/auth/session"

/** Member-only area (dashboard, nutrition, workouts, …). */
export default async function MemberLayout({ children }: LayoutProps<"/">) {
  await requireMember()
  return children
}
