"use client";
import { Mountain, Mail, MapPin, FileSignature, Mic, Map, MessagesSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useView } from "@/stores/view-store";
import { CITY_ZONES } from "@/lib/constants";

// Future plans / roadmap items. Shown as a strip just above the bottom bar
// so visitors and the FYP committee can see where the project is headed.
const FUTURE_PLANS = [
  {
    icon: FileSignature,
    title: "Agreement system",
    description: "Digital rental agreements with e-signatures.",
  },
  {
    icon: Mic,
    title: "Voice search",
    description: "Search listings by speaking in Urdu / Shina / Burushaski.",
  },
  {
    icon: Map,
    title: "Interactive maps",
    description: "Browse listings on a real map of the GB valleys.",
  },
  {
    icon: MessagesSquare,
    title: "In-app messages",
    description: "Tenant–lister chat without leaving the platform.",
  },
];

export function Footer() {
  const go = useView((s) => s.go);
  return (
    <footer className="mt-auto border-t border-border bg-secondary/30">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Mountain className="size-5" />
            </span>
            <div>
              <p className="text-lg font-bold tracking-tight">GB Rent</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Gilgit-Baltistan Rentals
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">
            Find and list rental properties across the valleys of Gilgit-Baltistan —
            shops, houses, rooms and hostels in Gilgit, Hunza, Skardu and beyond.
            Built for students, families and professionals relocating across the region.
          </p>
          <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Mail className="size-4 text-primary" />
              <span>Help centre: <a href="mailto:xanoo302@gmail.com" className="font-medium hover:text-primary hover:underline">xanoo302@gmail.com</a></span>
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" />
              <span>Location: Gilgit, Danyore</span>
            </span>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold">Explore</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Button variant="link" className="h-auto p-0 text-muted-foreground hover:text-primary" onClick={() => go({ name: "home" })}>
                Browse listings
              </Button>
            </li>
            <li>
              <Button variant="link" className="h-auto p-0 text-muted-foreground hover:text-primary" onClick={() => go({ name: "create" })}>
                List a property
              </Button>
            </li>
            <li>
              <Button variant="link" className="h-auto p-0 text-muted-foreground hover:text-primary" onClick={() => go({ name: "dashboard" })}>
                My dashboard
              </Button>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold">Popular zones</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {["Gilgit", "Hunza", "Skardu", "Nagar", "Shigar"].map((c) => (
              <li key={c}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={() => go({ name: "home" })}
                >
                  {c}
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-muted-foreground">
            Serving all {CITY_ZONES.length} districts of Gilgit-Baltistan
          </p>
        </div>
      </div>

      {/* Future plans / roadmap strip. Visible on every page so visitors and
          the FYP committee can see where the project is headed. */}
      <div className="border-t border-border bg-background/40">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="size-4 text-accent-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Future plans
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FUTURE_PLANS.map((plan) => (
              <div
                key={plan.title}
                className="flex items-start gap-3 rounded-lg border border-border bg-card/60 p-4 transition-colors hover:bg-card"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/40 text-accent-foreground">
                  <plan.icon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{plan.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {plan.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} GB Rent. Built for the communities of Gilgit-Baltistan.</p>
          <p>
            Final year project by <span className="font-medium text-foreground">Zain ul Abdin · Hanan Ali · Hasanat</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

