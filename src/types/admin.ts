import type { GymStatus, Role, UserStatus } from "@/lib/auth/roles"

/** Client-safe views returned by services. Dates are ISO strings. */

export interface MemberSummary {
  id: string
  name: string
  email: string
  phone: string | null
  status: UserStatus
  createdAt: string
}

export interface MemberDetail extends MemberSummary {
  dateOfBirth: string | null
  notes: string | null
  gymName: string
  updatedAt: string
}

export interface GymOverview {
  id: string
  name: string
  slug: string
  status: GymStatus
  plan: string
  subscriptionStatus: string
  createdAt: string
}

export interface GymStats {
  totalMembers: number
  activeMembers: number
  disabledMembers: number
}

export interface PlatformGymRow extends GymOverview {
  ownerName: string | null
  ownerEmail: string | null
  memberCount: number
  adminCount: number
}

export interface PlatformUserRow {
  id: string
  name: string
  email: string
  role: Role
  status: UserStatus
  gymName: string | null
  createdAt: string
}

export interface PlatformStats {
  gyms: number
  activeGyms: number
  gymAdmins: number
  members: number
}
