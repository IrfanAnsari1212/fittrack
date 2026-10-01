/**
 * Serving units. A fixed list (not free text) so nutrition math is always
 * well defined: a quantity is either in the food's own serving unit or in
 * whole "servings". Unit conversion (g ↔ oz, …) is intentionally not
 * supported yet.
 */
export const SERVING_UNITS = [
  "g",
  "ml",
  "piece",
  "slice",
  "cup",
  "tbsp",
  "tsp",
  "scoop",
  "serving",
] as const

export type ServingUnit = (typeof SERVING_UNITS)[number]

export const servingUnitLabels: Record<ServingUnit, { singular: string; plural: string }> = {
  g: { singular: "g", plural: "g" },
  ml: { singular: "ml", plural: "ml" },
  piece: { singular: "piece", plural: "pieces" },
  slice: { singular: "slice", plural: "slices" },
  cup: { singular: "cup", plural: "cups" },
  tbsp: { singular: "tbsp", plural: "tbsp" },
  tsp: { singular: "tsp", plural: "tsp" },
  scoop: { singular: "scoop", plural: "scoops" },
  serving: { singular: "serving", plural: "servings" },
}
