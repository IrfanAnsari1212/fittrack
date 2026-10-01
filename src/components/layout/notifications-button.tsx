import { Bell } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Placeholder — notifications/reminders are implemented in a later module. */
export function NotificationsButton({ hasUnread = true }: { hasUnread?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={hasUnread ? "Notifications (unread)" : "Notifications"}
    >
      <Bell />
      {hasUnread && (
        <span
          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background"
          aria-hidden
        />
      )}
    </Button>
  )
}
