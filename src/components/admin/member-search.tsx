import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"

/** Plain GET form: works without JavaScript and keeps the query in the URL. */
export function MemberSearch({ defaultValue }: { defaultValue?: string }) {
  return (
    <form role="search" className="relative w-full sm:max-w-xs">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <label htmlFor="member-search" className="sr-only">
        Search members
      </label>
      <Input
        id="member-search"
        name="q"
        type="search"
        placeholder="Search by name or email"
        defaultValue={defaultValue}
        className="pl-8"
      />
    </form>
  )
}
