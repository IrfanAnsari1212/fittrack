# FitTrack

Personal fitness tracking app — Next.js (App Router), TypeScript, Tailwind CSS v4, shadcn/ui (Base UI), Lucide.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build + type check
npm run lint
```

## Project structure

```
src/
  app/
    (marketing)/        Public pages (landing) — SiteHeader layout
    (auth)/             Login / register — centered card layout
    (app)/              Signed-in area — AppShell (sidebar + header)
      dashboard/        Dashboard (+ loading.tsx skeleton)
      nutrition/ workouts/ recovery/ progress/ analytics/ profile/
      admin/            Admin dashboard (placeholder)
  components/
    ui/                 shadcn/ui primitives (generated — avoid hand edits)
    layout/             AppShell, AppSidebar, AppHeader, MobileNav, menus, theme toggle
    navigation/         NavLinks (active-state aware)
    dashboard/          Dashboard widgets + skeletons
    charts/             Lightweight chart primitives (Sparkline)
    common/             Logo, PageHeader, EmptyState, ModulePlaceholder
    auth/               Auth form placeholder
    providers/          Client providers (theme, tooltip)
  lib/                  navigation config, site config, formatters, mock data, utils
  types/                Shared TypeScript types (view models)
```

## Conventions

- Navigation is defined once in `src/lib/navigation.ts`.
- Pages are thin: fetch data, then render feature components.
- Widgets take typed props (`src/types`) and handle their own empty state; each layout has a matching skeleton.
- Mock data lives only in `src/lib/mock-data.ts` behind `getDashboardData()`.
