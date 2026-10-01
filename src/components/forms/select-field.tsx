import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { FormState } from "@/lib/form-state"
import { cn } from "@/lib/utils"

interface SelectFieldProps {
  name: string
  label: string
  state: FormState
  options: readonly { value: string; label: string }[]
  defaultValue?: string | null
  required?: boolean
  placeholder?: string
  className?: string
}

/** Label + native select + server-side error (works with plain FormData). */
export function SelectField({
  name,
  label,
  state,
  options,
  defaultValue,
  required,
  placeholder,
  className,
}: SelectFieldProps) {
  const errors = state.fieldErrors?.[name]
  const value = state.values?.[name] ?? defaultValue ?? ""
  const errorId = `${name}-error`

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name}>{label}</Label>
      <NativeSelect
        key={value}
        id={name}
        name={name}
        defaultValue={value}
        required={required}
        className="w-full"
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? errorId : undefined}
      >
        {placeholder && (
          <NativeSelectOption value="" disabled>
            {placeholder}
          </NativeSelectOption>
        )}
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {errors?.length ? (
        <p id={errorId} className="text-sm text-destructive">
          {errors[0]}
        </p>
      ) : null}
    </div>
  )
}
