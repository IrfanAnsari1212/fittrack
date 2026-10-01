import {
  Activity,
  BarChart3,
  Dumbbell,
  LayoutDashboard,
  ShieldCheck,
  TrendingUp,
  User,
  Utensils,
} from "lucide-react"

import type { NavSection } from "@/types/navigation"

/** Single source of truth for app navigation (sidebar + mobile drawer). */
export const appNavigation: NavSection[] = [
  {
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Nutrition", href: "/nutrition", icon: Utensils },
      { title: "Workouts", href: "/workouts", icon: Dumbbell },
      { title: "Recovery", href: "/recovery", icon: Activity },
      { title: "Progress", href: "/progress", icon: TrendingUp },
      { title: "Analytics", href: "/analytics", icon: BarChart3 },
      { title: "Profile", href: "/profile", icon: User },
    ],
  },
  {
    title: "Admin",
    items: [{ title: "Admin Dashboard", href: "/admin", icon: ShieldCheck }],
  },
]

export function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}
