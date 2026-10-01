import { Logo } from "@/components/common/logo"

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/30 px-4 py-12">
      <Logo />
      <main className="w-full max-w-sm">{children}</main>
    </div>
  )
}
