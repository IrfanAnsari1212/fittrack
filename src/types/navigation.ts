import type { LucideIcon } from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  /** Optional short label for compact/mobile UIs. */
  description?: string
}

export interface NavSection {
  /** Section heading; omit for the primary (unlabelled) section. */
  title?: string
  items: NavItem[]
}
