import type { LucideIcon } from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  /** Only highlight on an exact match (for section roots like /admin). */
  exact?: boolean
  /** Planned for a later module: shown greyed out with a "Soon" badge. */
  disabled?: boolean
}

export interface NavSection {
  /** Section heading; omit for the primary (unlabelled) section. */
  title?: string
  items: NavItem[]
}
