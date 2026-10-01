import { z } from "zod"

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"))

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Must be at least 2 characters")
  .max(100, "Must be at most 100 characters")

export const newPasswordSchema = z
  .string()
  .min(8, "Must be at least 8 characters")
  .max(128, "Must be at most 128 characters")

/** Optional text input: empty string → null. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .transform((value) => value || null)
}

/** Optional `<input type="date">`: empty → null, otherwise a valid past date. */
export const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null
    const date = new Date(`${value}T00:00:00Z`)
    if (Number.isNaN(date.getTime()) || date > new Date()) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date" })
      return z.NEVER
    }
    return date
  })

/** Turn FormData into a plain object of strings for schema parsing. */
export function formDataToObject(formData: FormData) {
  const values: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) values[key] = value
  }
  return values
}
