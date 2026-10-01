"use client"

import { useState, useTransition } from "react"
import { UserCheck, UserX } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import type { UserStatus } from "@/lib/auth/roles"
import { setMemberStatusAction } from "@/server/actions/member-actions"

export function MemberStatusToggle({
  memberId,
  memberName,
  status,
}: {
  memberId: string
  memberName: string
  status: UserStatus
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()
  const disabling = status === "ACTIVE"

  function confirm() {
    startTransition(async () => {
      const result = await setMemberStatusAction(memberId, disabling ? "DISABLED" : "ACTIVE")
      setError(result.error)
      if (!result.error) setOpen(false)
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant={disabling ? "destructive" : "outline"} />}
      >
        {disabling ? <UserX data-icon="inline-start" /> : <UserCheck data-icon="inline-start" />}
        {disabling ? "Disable member" : "Re-enable member"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {disabling ? `Disable ${memberName}?` : `Re-enable ${memberName}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {disabling
              ? "They will be signed out and won't be able to log in until re-enabled. Their data is kept."
              : "They will be able to log in again."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={disabling ? "destructive" : "default"}
            disabled={isPending}
            onClick={confirm}
          >
            {isPending ? "Saving…" : disabling ? "Disable" : "Re-enable"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
