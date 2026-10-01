import Link from "next/link"
import { Activity, ArrowRight, Dumbbell, LineChart, Utensils } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const features = [
  {
    icon: Utensils,
    title: "Nutrition",
    description: "Hit your daily calorie and protein targets with simple meal checklists.",
  },
  {
    icon: Dumbbell,
    title: "Workouts",
    description: "Plan sessions, log sets and weights, and apply progressive overload.",
  },
  {
    icon: Activity,
    title: "Recovery",
    description: "Track sleep, energy and soreness to train hard without burning out.",
  },
  {
    icon: LineChart,
    title: "Progress",
    description: "See body weight, measurements and trends over time at a glance.",
  },
]

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-sm font-medium text-primary">
            Your personal fitness command center
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Track nutrition, training and recovery in one place.
          </h1>
          <p className="mt-6 text-lg text-pretty text-muted-foreground">
            FitTrack keeps your daily targets, workouts and progress organized
            so you can focus on showing up.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" nativeButton={false} render={<Link href="/login" />}>
              Log in
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href="/register" />}
            >
              How to get an account
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title}>
              <CardContent className="space-y-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2 className="font-medium">{title}</h2>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  )
}
