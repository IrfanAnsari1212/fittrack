import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { FormState } from "@/lib/form-state"
import { cn } from "@/lib/utils"

interface FormFieldProps {
  name: string
  label: string
  state: FormState
  type?: string
  defaultValue?: string | null
  required?: boolean
  autoComplete?: string
  placeholder?: string
  description?: string
  multiline?: boolean
  /** For numeric inputs. */
  step?: string
  min?: string
  className?: string
}

/** Label + input + server-side error, wired for screen readers. */
export function FormField({
  name,
  label,
  state,
  type = "text",
  defaultValue,
  required,
  autoComplete,
  placeholder,
  description,
  multiline,
  step,
  min,
  className,
}: FormFieldProps) {
  const errors = state.fieldErrors?.[name]
  const value = state.values?.[name] ?? defaultValue ?? ""
  const errorId = `${name}-error`
  const descriptionId = `${name}-description`
  const describedBy =
    [errors?.length ? errorId : null, description ? descriptionId : null]
      .filter(Boolean)
      .join(" ") || undefined

  const shared = {
    id: name,
    name,
    // `key` resets the uncontrolled input when the server echoes new values.
    defaultValue: value,
    required,
    placeholder,
    "aria-invalid": errors?.length ? true : undefined,
    "aria-describedby": describedBy,
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name}>
        {label}
        {!required && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      {multiline ? (
        <Textarea key={value} rows={3} {...shared} />
      ) : (
        <Input key={value} type={type} autoComplete={autoComplete} step={step} min={min} {...shared} />
      )}
      {description && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {errors?.length ? (
        <p id={errorId} className="text-sm text-destructive">
          {errors[0]}
        </p>
      ) : null}
    </div>
  )
}
