"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { FormState } from "@/lib/form-state"
import { useLocalCalendarDate } from "@/lib/nutrition/use-local-date"
import { cn } from "@/lib/utils"

/**
 * Date input that defaults to the user's LOCAL today (from the browser —
 * the server never guesses the day). Echoed form values take precedence.
 */
export function LocalDateField({
  name,
  label,
  state,
  required,
  defaultToToday = true,
  description,
  className,
}: {
  name: string
  label: string
  state: FormState
  required?: boolean
  defaultToToday?: boolean
  description?: string
  className?: string
}) {
  const today = useLocalCalendarDate()
  const [edited, setEdited] = useState<string>()
  const echoed = state.values?.[name]
  const value = edited ?? echoed ?? (defaultToToday ? today : "")
  const errors = state.fieldErrors?.[name]

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name}>
        {label}
        {!required && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type="date"
        value={value}
        onChange={(e) => setEdited(e.target.value)}
        required={required}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? `${name}-error` : undefined}
      />
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {errors?.length ? (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {errors[0]}
        </p>
      ) : null}
    </div>
  )
}
