"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { appNavigation, isNavItemActive } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import type { NavSection } from "@/types/navigation"

interface NavLinksProps {
  /**
   * Defaults to the app navigation. Imported here (client side) because
   * icon components can't be passed as props from Server Components.
   */
  sections?: NavSection[]
  /** Called after a link is clicked (used to close the mobile drawer). */
  onNavigate?: () => void
}

export function NavLinks({ sections = appNavigation, onNavigate }: NavLinksProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {sections.map((section, index) => (
        <div
          key={section.title ?? index}
          className={cn(section.title && "border-t border-sidebar-border pt-4")}
        >
          {section.title && (
            <p className="mb-2 px-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {section.title}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active = isNavItemActive(pathname, item.href)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon
                      className={cn("size-4", active && "text-sidebar-primary")}
                      aria-hidden
                    />
                    {item.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
