import { SiteHeader } from "@/components/layout/site-header"
import { siteConfig } from "@/lib/site-config"

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} {siteConfig.name}
        </div>
      </footer>
    </div>
  )
}
