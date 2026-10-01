import type { Metadata } from "next"

import { PageHeader } from "@/components/common/page-header"
import { ProfileForm } from "@/components/profile/profile-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { roleLabels } from "@/lib/auth/roles"
import { requireAuth } from "@/server/auth/session"
import { getOwnProfile } from "@/server/services/profile-service"

export const metadata: Metadata = { title: "Profile" }

export default async function ProfilePage() {
  const user = await requireAuth()
  const profile = await getOwnProfile(user)

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your personal details." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Personal information</CardTitle>
            <CardDescription>Update how your name and phone appear.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profile} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium break-all">{profile.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-medium">{roleLabels[user.role]}</dd>
              </div>
              {user.gymName && (
                <div>
                  <dt className="text-muted-foreground">Gym</dt>
                  <dd className="font-medium">{user.gymName}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Member since</dt>
                <dd className="font-medium">
                  {new Date(profile.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
