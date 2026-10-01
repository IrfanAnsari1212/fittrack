import type { Metadata } from "next"

import { AuthPlaceholderCard } from "@/components/auth/auth-placeholder-card"

export const metadata: Metadata = { title: "Log in" }

export default function LoginPage() {
  return (
    <AuthPlaceholderCard
      title="Welcome back"
      description="Log in to your FitTrack account."
      fields={[
        { id: "email", label: "Email", type: "email", autoComplete: "email" },
        { id: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
      submitLabel="Log in"
      footer={{ text: "No account?", linkLabel: "Sign up", href: "/register" }}
    />
  )
}
