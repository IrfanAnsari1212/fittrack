import type { Query, Schema } from "mongoose"

/**
 * Tenant guard for gym-owned collections.
 *
 * Every query on a model using `tenantGuardPlugin` must filter by `gymId`
 * (normally via `scopeToGym` / `scopeToMember` in `src/server/tenant.ts`).
 * A query without one throws instead of silently reading every gym's data.
 *
 * The rare legitimate cross-tenant query (login lookup by email, Super Admin
 * reporting) must opt out explicitly with `crossTenant(query)`, which makes
 * those call sites easy to find and review.
 */

// `Symbol.for` (global registry): bundlers may instantiate this module more
// than once, while Mongoose models are process-wide singletons.
const CROSS_TENANT = Symbol.for("fittrack.crossTenant")

const GUARDED_QUERY_OPS = [
  "countDocuments",
  "deleteMany",
  "deleteOne",
  "distinct",
  "find",
  "findOne",
  "findOneAndDelete",
  "findOneAndReplace",
  "findOneAndUpdate",
  "replaceOne",
  "updateMany",
  "updateOne",
] as const

export class TenantScopeError extends Error {
  constructor(modelName: string, op: string) {
    super(
      `Unscoped ${op} on tenant model "${modelName}". Filter by gymId ` +
        `(scopeToGym/scopeToMember) or wrap the query in crossTenant().`
    )
    this.name = "TenantScopeError"
  }
}

/** Explicitly mark a query as intentionally spanning all gyms. */
export function crossTenant<Q extends Query<unknown, unknown>>(query: Q): Q {
  ;(query as unknown as Record<symbol, boolean>)[CROSS_TENANT] = true
  return query
}

export function tenantGuardPlugin(schema: Schema) {
  for (const op of GUARDED_QUERY_OPS) {
    schema.pre(op, function (this: Query<unknown, unknown>) {
      if ((this as unknown as Record<symbol, boolean>)[CROSS_TENANT]) return
      if (!Object.hasOwn(this.getFilter(), "gymId")) {
        throw new TenantScopeError(this.model.modelName, op)
      }
    })
  }
}
