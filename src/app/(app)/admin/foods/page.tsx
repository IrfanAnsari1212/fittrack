import type { Metadata } from "next"
import Link from "next/link"
import { Apple, Search } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"
import { FoodFormDialog } from "@/components/nutrition/admin/food-form-dialog"
import { FoodRowActions } from "@/components/nutrition/admin/food-row-actions"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatAmount, formatServing } from "@/lib/nutrition/format"
import { cn } from "@/lib/utils"
import { requireGymAdmin } from "@/server/auth/session"
import { listFoods } from "@/server/services/nutrition/food-service"

export const metadata: Metadata = { title: "Food library" }

const optional = (value: number | null) => (value == null ? "—" : `${formatAmount(value)} g`)

export default async function FoodLibraryPage({ searchParams }: PageProps<"/admin/foods">) {
  const admin = await requireGymAdmin()
  const params = await searchParams
  const query = typeof params.q === "string" ? params.q : undefined
  const showArchived = params.archived === "1"
  // Scoped to the admin's gym inside the service.
  const foods = await listFoods(admin, { query, includeArchived: showArchived })

  const filterHref = (archived: boolean) => {
    const sp = new URLSearchParams()
    if (query) sp.set("q", query)
    if (archived) sp.set("archived", "1")
    const qs = sp.toString()
    return `/admin/foods${qs ? `?${qs}` : ""}`
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Food library"
        description={`Foods available to ${admin.gymName}'s diet plans and members.`}
        actions={<FoodFormDialog />}
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form role="search" className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <label htmlFor="food-search" className="sr-only">Search foods</label>
              <Input id="food-search" name="q" type="search" placeholder="Search foods" defaultValue={query} className="pl-8" />
              {showArchived && <input type="hidden" name="archived" value="1" />}
            </form>
            <div className="flex gap-1 text-sm" role="group" aria-label="Status filter">
              {[
                { label: "Active", archived: false },
                { label: "All incl. archived", archived: true },
              ].map((f) => (
                <Link
                  key={f.label}
                  href={filterHref(f.archived)}
                  aria-current={showArchived === f.archived ? "true" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1 transition-colors",
                    showArchived === f.archived ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>

          {foods.length === 0 ? (
            <EmptyState
              icon={Apple}
              title={query ? "No matching foods" : "Your gym food library is empty."}
              description={query ? `Nothing matches “${query}”.` : "Add foods to build diet plans."}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Food</TableHead>
                  <TableHead className="text-right">kcal</TableHead>
                  <TableHead className="text-right">Protein</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Carbs</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Fat</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {foods.map((food) => (
                  <TableRow key={food.id} className={cn(food.status === "ARCHIVED" && "opacity-70")}>
                    <TableCell>
                      <p className="font-medium">{food.name}</p>
                      <p className="text-xs text-muted-foreground">{formatServing(food.servingSize, food.servingUnit)}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(food.calories)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(food.protein)} g</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{optional(food.carbs)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{optional(food.fat)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge status={food.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <FoodRowActions food={food} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
