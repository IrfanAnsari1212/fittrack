"use server"

import { AuthError, CredentialsSignin } from "next-auth"
import { redirect } from "next/navigation"

import { signIn, signOut } from "@/auth"
import { homePathFor } from "@/lib/auth/roles"
import { findRouteRule, safeCallbackPath } from "@/lib/auth/route-access"
import type { FormState } from "@/lib/form-state"
import { loginSchema } from "@/lib/validations/schemas"
import { parseForm } from "@/server/actions/action-utils"
import { findRoleByEmail } from "@/server/auth/account"

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(loginSchema, formData)
  if (!parsed.ok) return parsed.state
  const { email, password } = parsed.data

  try {
    await signIn("credentials", { email, password, redirect: false })
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return {
        error:
          error.code === "account_unavailable"
            ? "This account or its gym is not active. Please contact your gym."
            : "Invalid email or password.",
        values: { email },
      }
    }
    if (error instanceof AuthError) {
      return { error: "Couldn't sign you in. Please try again.", values: { email } }
    }
    throw error
  }

  const role = await findRoleByEmail(email)
  const callback = safeCallbackPath(formData.get("callbackUrl"))
  const callbackAllowed =
    callback && role && (findRouteRule(callback)?.roles.includes(role) ?? false)

  redirect(callbackAllowed ? callback : role ? homePathFor(role) : "/")
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" })
}
