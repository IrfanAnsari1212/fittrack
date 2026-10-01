import type { Metadata } from "next"

import { AuthPlaceholderCard } from "@/components/auth/auth-placeholder-card"

export const metadata: Metadata = { title: "Create account" }

export default function RegisterPage() {
  return (
    <AuthPlaceholderCard
      title="Create your account"
      description="Start tracking your nutrition, training and progress."
      fields={[
        { id: "name", label: "Name", type: "text", autoComplete: "name" },
        { id: "email", label: "Email", type: "email", autoComplete: "email" },
        { id: "password", label: "Password", type: "password", autoComplete: "new-password" },
      ]}
      submitLabel="Create account"
      footer={{ text: "Already have an account?", linkLabel: "Log in", href: "/login" }}
    />
  )
}
