import type { DashboardData } from "@/types/dashboard"

/**
 * Static preview data for the dashboard parts not built yet
 * (recovery, weight, progress). Nutrition (3B) and workouts (4) are real. Replace `getDashboardData` with a
 * real data source in a later module; components only depend on the types.
 */
export const mockDashboardData: DashboardData = {
  recovery: {
    sleepHours: 7.2,
    sleepTargetHours: 8,
    energy: 4,
    soreness: 2,
    note: "Slight tightness in lower back.",
  },
  weight: {
    currentKg: 78.4,
    goalKg: 75,
    startKg: 82,
    history: [
      { date: "2026-08-20", weightKg: 80.6 },
      { date: "2026-08-27", weightKg: 80.1 },
      { date: "2026-09-03", weightKg: 79.8 },
      { date: "2026-09-10", weightKg: 79.4 },
      { date: "2026-09-17", weightKg: 79.0 },
      { date: "2026-09-24", weightKg: 78.9 },
      { date: "2026-10-01", weightKg: 78.4 },
    ],
  },
  goals: [
    { id: "g1", label: "Workouts this week", current: 3, target: 5, unit: "sessions" },
    { id: "g4", label: "Sleep ≥ 7h", current: 4, target: 7, unit: "nights" },
  ],
}

export async function getDashboardData(): Promise<DashboardData> {
  return mockDashboardData
}
