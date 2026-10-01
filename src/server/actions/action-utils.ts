import "server-only"

import { z } from "zod"

import type { FormState } from "@/lib/form-state"
import { formDataToObject } from "@/lib/validations/common"
import { DomainError } from "@/server/errors"

const PASSWORD_FIELDS = new Set(["password", "adminPassword"])

/** Never echo passwords back to the browser. */
function echoValues(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !PASSWORD_FIELDS.has(key))
  )
}

export function parseForm<S extends z.ZodType>(schema: S, formData: FormData) {
  const values = formDataToObject(formData)
  const result = schema.safeParse(values)
  if (result.success) return { ok: true as const, data: result.data as z.output<S>, values }
  return {
    ok: false as const,
    state: {
      fieldErrors: z.flattenError(result.error).fieldErrors,
      values: echoValues(values),
    } satisfies FormState,
  }
}

const messages: Record<DomainError["code"], string> = {
  EMAIL_TAKEN: "An account with this email already exists.",
  NOT_FOUND: "This record doesn't exist or you don't have access to it.",
}

export function domainErrorState(
  error: unknown,
  values: Record<string, string>
): FormState {
  if (error instanceof DomainError) {
    return error.code === "EMAIL_TAKEN"
      ? { fieldErrors: { email: [messages.EMAIL_TAKEN], adminEmail: [messages.EMAIL_TAKEN] }, values: echoValues(values) }
      : { error: messages[error.code], values: echoValues(values) }
  }
  throw error
}
