import type { DashboardData } from "@/types/dashboard"

/**
 * Static preview data for the dashboard. Replace `getDashboardData` with a
 * real data source in a later module; components only depend on the types.
 */
export const mockDashboardData: DashboardData = {
  nutrition: {
    calories: { consumed: 1640, target: 2400 },
    protein: { consumed: 112, target: 170 },
  },
  meals: [
    { id: "m1", name: "Oats, whey & berries", time: "07:30", calories: 520, protein: 38, status: "completed" },
    { id: "m2", name: "Chicken rice bowl", time: "12:30", calories: 680, protein: 52, status: "completed" },
    { id: "m3", name: "Greek yogurt & almonds", time: "16:00", calories: 440, protein: 22, status: "skipped" },
    { id: "m4", name: "Salmon, potatoes & greens", time: "19:30", calories: 720, protein: 48, status: "upcoming" },
  ],
  workout: {
    id: "w1",
    name: "Upper Body — Push",
    focus: "Chest · Shoulders · Triceps",
    durationMinutes: 60,
    completed: false,
    exercises: [
      { id: "e1", name: "Bench Press", sets: 4, reps: "6-8", weightKg: 80 },
      { id: "e2", name: "Overhead Press", sets: 3, reps: "8-10", weightKg: 45 },
      { id: "e3", name: "Incline DB Press", sets: 3, reps: "10-12", weightKg: 28 },
      { id: "e4", name: "Cable Lateral Raise", sets: 3, reps: "12-15", weightKg: 10 },
    ],
  },
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
    { id: "g2", label: "Protein target hit", current: 5, target: 7, unit: "days" },
    { id: "g3", label: "Meals logged", current: 22, target: 28, unit: "meals" },
    { id: "g4", label: "Sleep ≥ 7h", current: 4, target: 7, unit: "nights" },
  ],
}

export async function getDashboardData(): Promise<DashboardData> {
  return mockDashboardData
}
