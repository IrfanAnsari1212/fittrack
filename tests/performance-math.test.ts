/** Module 5: pure performance math — metrics, comparison, records, recommendation. No database. */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  compareSessions,
  convertWeight,
  estimateOneRepMax,
  observedStep,
  plannedVsActual,
  personalRecords,
  recommend,
  recordsSetIn,
  sessionMetrics,
  type DatedSets,
  type PerformedSet,
} from "@/lib/workout/performance"

const kg = (weight: number | null, reps: number | null): PerformedSet => ({ weight, weightUnit: "kg", reps })
const day = (date: string, ...sets: PerformedSet[]): DatedSets => ({ date, startedAt: `${date}T10:00:00.000Z`, sets })
const near = (actual: number | null | undefined, expected: number, eps = 0.01) =>
  assert.ok(actual != null && Math.abs(actual - expected) < eps, `${actual} ≉ ${expected}`)
const metrics = (...sets: PerformedSet[]) => sessionMetrics(sets, "kg")!

describe("estimated 1RM (Epley)", () => {
  test("80 × 8 ≈ 101.3 kg", () => near(estimateOneRepMax(80, 8), 101.333))
  test("a single rep is the weight itself", () => assert.equal(estimateOneRepMax(100, 1), 100))
  test("omitted when not meaningful: bodyweight, zero, >12 reps, no reps", () => {
    assert.equal(estimateOneRepMax(null, 10), null)
    assert.equal(estimateOneRepMax(0, 10), null)
    assert.equal(estimateOneRepMax(50, 13), null)
    assert.equal(estimateOneRepMax(50, 12) !== null, true)
    assert.equal(estimateOneRepMax(50, null), null)
    assert.equal(estimateOneRepMax(50, 0), null)
  })
})

describe("session metrics", () => {
  test("best weight, best reps, volume and e1RM", () => {
    const m = metrics(kg(80, 8), kg(80, 8), kg(80, 7))
    assert.equal(m.bestWeight, 80)
    assert.equal(m.bestReps, 8)
    assert.equal(m.totalVolume, 1840)
    assert.equal(m.setCount, 3)
    assert.equal(m.totalReps, 23)
    near(m.bestE1rm, 101.333)
    assert.equal(m.repsAtBestWeight, 8)
    assert.equal(m.setsAtBestWeight, 3)
    assert.equal(m.minRepsAtBestWeight, 7)
  })

  test("best weight is the heaviest completed set; best reps is the most reps (with its weight)", () => {
    const m = metrics(kg(80, 8), kg(90, 3), kg(60, 12))
    assert.equal(m.bestWeight, 90)
    assert.equal(m.repsAtBestWeight, 3)
    assert.equal(m.bestReps, 12)
    assert.equal(m.weightAtBestReps, 60)
    assert.equal(m.totalVolume, 80 * 8 + 90 * 3 + 60 * 12)
    near(m.bestE1rm, Math.max(80 * (1 + 8 / 30), 90 * (1 + 3 / 30), 60 * (1 + 12 / 30)))
  })

  test("ignores unfinished/invalid sets; null when nothing usable", () => {
    assert.equal(sessionMetrics([kg(80, null), kg(80, 0)], "kg"), null)
    assert.equal(sessionMetrics([], "kg"), null)
    assert.equal(metrics(kg(80, 5), kg(80, null)).setCount, 1)
  })

  test("bodyweight sets count for reps only", () => {
    const m = metrics(kg(null, 12), kg(null, 10))
    assert.equal(m.bestWeight, null)
    assert.equal(m.totalVolume, null)
    assert.equal(m.bestE1rm, null)
    assert.equal(m.bestReps, 12)
    assert.equal(m.weightAtBestReps, null)
  })

  test("units stay consistent: lb is converted to the display unit", () => {
    near(convertWeight(100, "lb", "kg"), 45.359)
    near(convertWeight(45.359237, "kg", "lb"), 100, 0.001)
    const m = sessionMetrics([{ weight: 100, weightUnit: "lb", reps: 5 }, kg(50, 5)], "kg")!
    near(m.bestWeight, 50)
    near(m.totalVolume, 45.359237 * 5 + 250)
  })
})

describe("session comparison", () => {
  test("heavier weight, same reps", () => {
    const c = compareSessions(metrics(kg(85, 8), kg(85, 8), kg(85, 8)), metrics(kg(80, 8), kg(80, 8), kg(80, 8)))
    assert.equal(c.bestWeightDiff, 5)
    assert.equal(c.sameWeight, false)
    assert.equal(c.repsAtSameWeightDiff, null)
    assert.equal(c.bestRepsDiff, 0)
    assert.equal(c.volumeDiff, 85 * 24 - 80 * 24)
    near(c.e1rmDiff, 5 * (1 + 8 / 30), 0.1) // differences are rounded to 0.1
  })

  test("same weight, fewer reps (factual only)", () => {
    const c = compareSessions(metrics(kg(100, 6)), metrics(kg(100, 8)))
    assert.equal(c.sameWeight, true)
    assert.equal(c.repsAtSameWeightDiff, -2)
    assert.equal(c.bestRepsDiff, -2)
    assert.equal(c.bestWeightDiff, 0)
  })

  test("differences are null when one side has no weight", () => {
    const c = compareSessions(metrics(kg(null, 10)), metrics(kg(80, 8)))
    assert.equal(c.bestWeightDiff, null)
    assert.equal(c.volumeDiff, null)
    assert.equal(c.e1rmDiff, null)
  })
})

describe("personal records", () => {
  const history = [
    day("2026-10-01", kg(80, 8), kg(80, 8), kg(80, 7)),
    day("2026-10-08", kg(100, 3), kg(90, 5)),
    day("2026-10-15", kg(60, 15), kg(60, 12)),
  ]

  test("highest weight, reps, e1RM and session volume", () => {
    const r = personalRecords(history, "kg")
    assert.deepEqual(r.highestWeight, { value: 100, reps: 3, date: "2026-10-08" })
    assert.deepEqual(r.highestReps, { value: 15, weight: 60, date: "2026-10-15" })
    near(r.highestE1rm?.value, 100 * (1 + 3 / 30))
    assert.equal(r.highestE1rm?.date, "2026-10-08")
    assert.deepEqual(r.highestVolume, { value: 80 * 8 + 80 * 8 + 80 * 7, date: "2026-10-01" })
  })

  test("a worse later session doesn't erase a record; order of input doesn't matter", () => {
    const withWorse = [...history, day("2026-10-22", kg(40, 5))]
    assert.deepEqual(personalRecords(withWorse, "kg"), personalRecords(history, "kg"))
    assert.deepEqual(personalRecords([...history].reverse(), "kg"), personalRecords(history, "kg"))
  })

  test("ties keep the earliest date; no sets → no records", () => {
    const r = personalRecords([day("2026-10-01", kg(80, 5)), day("2026-10-08", kg(80, 5))], "kg")
    assert.equal(r.highestWeight?.date, "2026-10-01")
    assert.deepEqual(personalRecords([], "kg"), { highestWeight: null, highestReps: null, highestE1rm: null, highestVolume: null })
  })

  test("new PR detection: strictly better than everything before; unchanged is not new", () => {
    const earlier = [day("2026-10-01", kg(80, 8)), day("2026-10-08", kg(85, 5))]
    assert.deepEqual(recordsSetIn(day("2026-10-15", kg(95, 3)), earlier, "kg"), ["weight", "e1rm"])
    assert.deepEqual(recordsSetIn(day("2026-10-15", kg(85, 5)), earlier, "kg"), [], "equal is not a new record")
    assert.deepEqual(recordsSetIn(day("2026-10-15", kg(70, 5)), earlier, "kg"), [], "lower performance sets nothing")
    assert.deepEqual(recordsSetIn(day("2026-10-15", kg(80, 8)), [], "kg"), [], "first session has nothing to beat")
    assert.ok(recordsSetIn(day("2026-10-15", kg(60, 20)), earlier, "kg").includes("reps"))
  })

  test("exercises are independent (records come only from the sessions passed in)", () => {
    const bench = personalRecords([day("2026-10-01", kg(100, 5))], "kg")
    const squat = personalRecords([day("2026-10-01", kg(140, 5))], "kg")
    assert.equal(bench.highestWeight?.value, 100)
    assert.equal(squat.highestWeight?.value, 140)
  })
})

describe("recommendation", () => {
  const range = { sets: 3, repsMin: 8, repsMax: 10 }
  const fixed = { sets: 3, repsMin: 8, repsMax: null }

  test("insufficient data is not a recommendation", () => {
    assert.equal(recommend([], range, "kg").kind, "INSUFFICIENT_DATA")
    const one = recommend([metrics(kg(80, 8))], range, "kg")
    assert.equal(one.kind, "INSUFFICIENT_DATA")
    assert.equal(one.observation, "Complete more sessions to compare your progress.")
    assert.equal(one.suggestion, null)
    assert.equal(one.suggestedWeight, null)
  })

  test("top of the planned rep range → a gentle suggestion, no invented weight", () => {
    const r = recommend([metrics(kg(80, 8), kg(80, 8), kg(80, 8)), metrics(kg(80, 10), kg(80, 10), kg(80, 10))], range, "kg")
    assert.equal(r.kind, "TOP_OF_RANGE")
    assert.equal(r.observation, "You reached the top of the planned rep range on every set.")
    assert.equal(r.suggestion, "Consider a small weight increase next session.")
    assert.equal(r.suggestedWeight, null, "no known step → no precise weight")
  })

  test("the top of the range on only some sets, or fewer sets than planned, is not enough", () => {
    assert.equal(recommend([metrics(kg(80, 8)), metrics(kg(80, 10), kg(80, 10), kg(80, 9))], range, "kg").suggestion, null)
    assert.equal(recommend([metrics(kg(80, 8)), metrics(kg(80, 10), kg(80, 10))], range, "kg").suggestion, null)
  })

  test("a precise weight is suggested only from the member's own observed step", () => {
    const hist = [metrics(kg(75, 8)), metrics(kg(77.5, 8)), metrics(kg(80, 8), kg(80, 8), kg(80, 8)), metrics(kg(80, 10), kg(80, 10), kg(80, 10))]
    assert.equal(observedStep(hist), 2.5)
    const r = recommend(hist, range, "kg")
    assert.equal(r.suggestedWeight, 82.5)
    assert.equal(observedStep([metrics(kg(80, 8)), metrics(kg(80, 8))]), null)
  })

  test("weight increase with the same reps is described, not prescribed", () => {
    const r = recommend([metrics(kg(80, 8), kg(80, 8), kg(80, 8)), metrics(kg(85, 8), kg(85, 8), kg(85, 8))], range, "kg")
    assert.equal(r.kind, "WEIGHT_UP")
    assert.equal(r.observation, "Working weight increased by 5 kg while maintaining reps.")
    assert.equal(r.suggestion, null)
  })

  test("weight up but fewer reps is stated factually", () => {
    const r = recommend([metrics(kg(80, 8)), metrics(kg(85, 6))], range, "kg")
    assert.equal(r.kind, "WEIGHT_UP")
    assert.match(r.observation, /went from 8 to 6/)
    assert.equal(r.suggestion, null)
  })

  test("lower performance: factual wording, no suggestion, no judgement", () => {
    const r = recommend([metrics(kg(100, 8)), metrics(kg(100, 6))], range, "kg")
    assert.equal(r.kind, "REPS_DOWN")
    assert.equal(r.observation, "Reps decreased from 8 to 6 at the same weight.")
    assert.equal(r.suggestion, null)
    const w = recommend([metrics(kg(100, 8)), metrics(kg(90, 8))], range, "kg")
    assert.equal(w.kind, "WEIGHT_DOWN")
    assert.equal(w.suggestion, null)
  })

  test("ambiguous data gives no suggestion", () => {
    const same = recommend([metrics(kg(80, 8), kg(80, 8), kg(80, 8)), metrics(kg(80, 8), kg(80, 8), kg(80, 8))], range, "kg")
    assert.equal(same.kind, "SAME")
    assert.equal(same.suggestion, null)
    const up = recommend([metrics(kg(80, 8)), metrics(kg(80, 9))], range, "kg")
    assert.equal(up.kind, "REPS_UP")
    assert.equal(up.suggestion, null)
    const noPlan = recommend([metrics(kg(80, 10)), metrics(kg(80, 10))], null, "kg")
    assert.equal(noPlan.suggestion, null)
  })

  test("a single fixed target needs two matching sessions in a row (no fake range)", () => {
    const once = recommend([metrics(kg(80, 7), kg(80, 7), kg(80, 7)), metrics(kg(80, 8), kg(80, 8), kg(80, 8))], fixed, "kg")
    assert.equal(once.suggestion, null)
    const twice = recommend([metrics(kg(80, 8), kg(80, 8), kg(80, 8)), metrics(kg(80, 8), kg(80, 8), kg(80, 8))], fixed, "kg")
    assert.equal(twice.kind, "TARGET_MET")
    assert.equal(twice.suggestion, "Consider a small weight increase next session.")
  })

  test("bodyweight exercises compare reps only", () => {
    const r = recommend([metrics(kg(null, 10)), metrics(kg(null, 12))], range, "kg")
    assert.equal(r.kind, "REPS_UP")
    assert.equal(r.suggestion, null)
    assert.equal(r.suggestedWeight, null)
  })
})

describe("planned vs actual (from the session's own snapshot)", () => {
  test("a heavier actual shows a plain difference; the plan is only read", () => {
    const planned = { targetWeight: 80, weightUnit: "kg" as const }
    const r = plannedVsActual(planned, [kg(85, 8), kg(85, 8), kg(85, 6)])
    assert.deepEqual(r, { unit: "kg", actualWeight: 85, actualReps: 8, weightDiff: 5 })
    assert.deepEqual(planned, { targetWeight: 80, weightUnit: "kg" })
  })

  test("lighter than planned is a negative difference; units are respected", () => {
    assert.equal(plannedVsActual({ targetWeight: 80, weightUnit: "kg" }, [kg(75, 8)])?.weightDiff, -5)
    const lb = plannedVsActual({ targetWeight: 100, weightUnit: "lb" }, [{ weight: 105, weightUnit: "lb", reps: 5 }])
    assert.equal(lb?.unit, "lb")
    assert.equal(lb?.weightDiff, 5)
    const mixed = plannedVsActual({ targetWeight: 100, weightUnit: "lb" }, [kg(50, 5)])
    assert.equal(mixed?.unit, "kg")
    near(mixed?.weightDiff, 50 - 45.359, 0.1)
  })

  test("no planned weight or no performed sets", () => {
    assert.equal(plannedVsActual({ targetWeight: null, weightUnit: "kg" }, [kg(60, 10)])?.weightDiff, null)
    assert.equal(plannedVsActual({ targetWeight: 80, weightUnit: "kg" }, []), null)
    assert.equal(plannedVsActual({ targetWeight: 80, weightUnit: "kg" }, [kg(80, null)]), null)
  })
})
