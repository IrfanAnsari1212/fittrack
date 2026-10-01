import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Field {
  id: string
  label: string
  type: string
  autoComplete: string
}

interface AuthPlaceholderCardProps {
  title: string
  description: string
  fields: Field[]
  submitLabel: string
  footer: { text: string; linkLabel: string; href: string }
}

/**
 * Static, non-functional auth form. Inputs are disabled until the
 * authentication module wires up real submission and validation.
 */
export function AuthPlaceholderCard({
  title,
  description,
  fields,
  submitLabel,
  footer,
}: AuthPlaceholderCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          <h1>{title}</h1>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" aria-describedby="auth-disabled-note">
          {fields.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.id}>{field.label}</Label>
              <Input
                id={field.id}
                type={field.type}
                autoComplete={field.autoComplete}
                disabled
              />
            </div>
          ))}
          <Button type="submit" className="w-full" disabled>
            {submitLabel}
          </Button>
          <p
            id="auth-disabled-note"
            className="text-center text-xs text-muted-foreground"
          >
            Authentication isn&apos;t available yet.
          </p>
        </form>
      </CardContent>
      <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
        {footer.text}
        <Link
          href={footer.href}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {footer.linkLabel}
        </Link>
      </CardFooter>
    </Card>
  )
}
