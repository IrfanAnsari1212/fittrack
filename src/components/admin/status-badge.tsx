import { Badge } from "@/components/ui/badge"

const labels: Record<string, string> = {
  ACTIVE: "Active",
  DISABLED: "Disabled",
  SUSPENDED: "Suspended",
  ARCHIVED: "Archived",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
}

const variants: Record<string, "secondary" | "outline" | "destructive"> = {
  ACTIVE: "secondary",
  ARCHIVED: "outline",
  COMPLETED: "outline",
}

/** Status pill for users, gyms, foods, plans and assignments. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={variants[status] ?? "destructive"}>{labels[status] ?? status}</Badge>
}
