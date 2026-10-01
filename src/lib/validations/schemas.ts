import { z } from "zod"

import {
  emailSchema,
  nameSchema,
  newPasswordSchema,
  optionalDate,
  optionalText,
} from "@/lib/validations/common"

/*
 * Input schemas deliberately contain NO gymId, userId or role fields.
 * Unknown keys are stripped, so a forged `gymId` in a request is discarded;
 * tenant and identity always come from the authenticated session.
 */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
})

export const memberProfileFields = {
  name: nameSchema,
  email: emailSchema,
  phone: optionalText(30),
  dateOfBirth: optionalDate,
  notes: optionalText(1000),
}

export const createMemberSchema = z.object({
  ...memberProfileFields,
  password: newPasswordSchema,
})
export type CreateMemberInput = z.infer<typeof createMemberSchema>

export const updateMemberSchema = z.object(memberProfileFields)
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>

export const createGymSchema = z.object({
  gymName: z.string().trim().min(2, "Must be at least 2 characters").max(120),
  adminName: nameSchema,
  adminEmail: emailSchema,
  adminPassword: newPasswordSchema,
})
export type CreateGymInput = z.infer<typeof createGymSchema>

export const gymSettingsSchema = z.object({
  name: z.string().trim().min(2, "Must be at least 2 characters").max(120),
})
export type GymSettingsInput = z.infer<typeof gymSettingsSchema>

export const profileSchema = z.object({
  name: nameSchema,
  phone: optionalText(30),
})
export type ProfileInput = z.infer<typeof profileSchema>
