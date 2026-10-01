import {
  Activity,
  Apple,
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  Salad,
  Settings,
  TrendingUp,
  User,
  Users,
  Utensils,
} from "lucide-react"

import type { Role } from "@/lib/auth/roles"
import type { NavItem, NavSection } from "@/types/navigation"

/**
 * Navigation per role. This only controls what is shown — access itself is
 * enforced server-side (proxy + Data Access Layer).
 */
const navigationByRole: Record<Role, NavSection[]> = {
  MEMBER: [
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
  ],
  GYM_ADMIN: [
    {
      title: "Gym",
      items: [
        { title: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
        { title: "Members", href: "/admin/members", icon: Users },
        { title: "Workout Plans", href: "/admin/workouts", icon: ClipboardList },
        { title: "Exercises", href: "/admin/exercises", icon: Dumbbell },
        { title: "Diet Plans", href: "/admin/diet-plans", icon: Salad },
        { title: "Food Library", href: "/admin/foods", icon: Apple },
        { title: "Analytics", href: "/admin/analytics", icon: BarChart3, disabled: true },
        { title: "Settings", href: "/admin/settings", icon: Settings },
      ],
    },
  ],
  SUPER_ADMIN: [
    {
      title: "Platform",
      items: [
        { title: "Dashboard", href: "/super-admin", icon: LayoutDashboard, exact: true },
        { title: "Gyms", href: "/super-admin/gyms", icon: Building2 },
        { title: "Users", href: "/super-admin/users", icon: Users },
        { title: "Subscriptions", href: "/super-admin/subscriptions", icon: CreditCard, disabled: true },
        { title: "Settings", href: "/super-admin/settings", icon: Settings, disabled: true },
      ],
    },
  ],
}

export function getNavigation(role: Role): NavSection[] {
  return navigationByRole[role]
}

export function isNavItemActive(pathname: string, item: Pick<NavItem, "href" | "exact">) {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}
