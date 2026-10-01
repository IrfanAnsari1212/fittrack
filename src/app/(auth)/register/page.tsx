import type { Metadata } from "next"
import Link from "next/link"
import { Building2, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata: Metadata = { title: "Get an account" }

/**
 * FitTrack has no open sign-up: gyms are created by the platform team and
 * members are added by their gym's admin.
 */
export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          <h1>Getting a FitTrack account</h1>
        </CardTitle>
        <CardDescription>Accounts are created for you — there is no public sign-up.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex gap-3">
          <UserPlus className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p>
            <span className="font-medium">Gym members:</span> ask your gym&apos;s admin to add you.
            You&apos;ll receive your login details from them.
          </p>
        </div>
        <div className="flex gap-3">
          <Building2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p>
            <span className="font-medium">Gym owners:</span> contact the FitTrack team to set up
            your gym.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full" nativeButton={false} render={<Link href="/login" />}>
          Back to log in
        </Button>
      </CardFooter>
    </Card>
  )
}
