/** Shape returned by server actions used with `useActionState`. */
export interface FormState {
  error?: string
  success?: string
  fieldErrors?: Record<string, string[] | undefined>
  /** Echoed back so inputs keep their values after a failed submit. */
  values?: Record<string, string>
}

export const initialFormState: FormState = {}
