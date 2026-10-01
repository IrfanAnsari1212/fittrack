"use client"

import { useState } from "react"
import { Menu } from "lucide-react"

import { Logo } from "@/components/common/logo"
import { NavLinks } from "@/components/navigation/nav-links"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { homePathFor, type Role } from "@/lib/auth/roles"

export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
          />
        }
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-0">
        <SheetHeader className="h-16 justify-center px-6">
          <SheetTitle render={<div />}>
            <Logo href={homePathFor(role)} />
          </SheetTitle>
          <SheetDescription className="sr-only">
            Main navigation
          </SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-3 pb-6">
          <NavLinks role={role} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
