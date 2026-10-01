/** Shape returned by server actions used with `useActionState`. */
export interface FormState {
  error?: string
  success?: string
  fieldErrors?: Record<string, string[] | undefined>
  /** Echoed back so inputs keep their values after a failed submit. */
  values?: Record<string, string>
  /** Machine-readable error code (e.g. to offer a follow-up action). */
  code?: string
}

/** Result of a non-form server action (buttons, JSON payloads). */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined>; code?: string }

export const initialFormState: FormState = {}
