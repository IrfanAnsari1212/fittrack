import { Badge } from "@/components/ui/badge"

const labels: Record<string, string> = {
  ACTIVE: "Active",
  DISABLED: "Disabled",
  SUSPENDED: "Suspended",
}

/** Status pill for users and gyms. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "ACTIVE" ? "secondary" : "destructive"}>
      {labels[status] ?? status}
    </Badge>
  )
}
