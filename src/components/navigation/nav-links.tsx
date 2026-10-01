"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import type { Role } from "@/lib/auth/roles"
import { getNavigation, isNavItemActive } from "@/lib/navigation"
import { cn } from "@/lib/utils"

interface NavLinksProps {
  /**
   * Navigation is looked up here (client side) from the role, because icon
   * components can't be passed as props from Server Components.
   */
  role: Role
  /** Called after a link is clicked (used to close the mobile drawer). */
  onNavigate?: () => void
}

const itemClassName =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"

export function NavLinks({ role, onNavigate }: NavLinksProps) {
  const pathname = usePathname()
  const sections = getNavigation(role)

  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {sections.map((section, index) => (
        <div key={section.title ?? index}>
          {section.title && (
            <p className="mb-2 px-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {section.title}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const Icon = item.icon
              if (item.disabled) {
                return (
                  <li key={item.href}>
                    <span
                      aria-disabled="true"
                      className={cn(itemClassName, "cursor-not-allowed text-muted-foreground/60")}
                    >
                      <Icon className="size-4" aria-hidden />
                      {item.title}
                      <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Soon
                      </span>
                    </span>
                  </li>
                )
              }

              const active = isNavItemActive(pathname, item)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      itemClassName,
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
