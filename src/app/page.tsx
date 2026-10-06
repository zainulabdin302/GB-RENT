"use client";
import { useEffect } from "react";
import { Header } from "@/components/gb-rent/header";
import { Footer } from "@/components/gb-rent/footer";
import { AuthDialog } from "@/components/gb-rent/auth-dialog";
import { useView } from "@/stores/view-store";
import { HomeView } from "@/components/gb-rent/home-view";
import { DetailView } from "@/components/gb-rent/detail-view";
import { CreateEditView } from "@/components/gb-rent/create-edit-view";
import { DashboardView } from "@/components/gb-rent/dashboard-view";
import { AdminView } from "@/components/gb-rent/admin-view";

/**
 * GB Rent — single-route SPA shell.
 *
 * The only user-visible route is "/" (per the sandbox constraint). The shell
 * renders one of five views based on the `view-store`. For a real production
 * build these would be Next.js file-based routes (/properties/[id], /dashboard,
 * /admin, /list/new) — the SPA-state approach here preserves the same UX.
 */
export default function Home() {
  const current = useView((s) => s.current);

  // Scroll to top whenever the view changes (mirrors route-change behaviour).
  const viewKey =
    current.name === "detail" || current.name === "edit" ? current.propertyId : "";
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [current.name, viewKey]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        {current.name === "home" && <HomeView />}
        {current.name === "detail" && <DetailView propertyId={current.propertyId} />}
        {current.name === "create" && <CreateEditView mode="create" />}
        {current.name === "edit" && <CreateEditView mode="edit" propertyId={current.propertyId} />}
        {current.name === "dashboard" && <DashboardView />}
        {current.name === "admin" && <AdminView />}
      </main>
      <Footer />
      <AuthDialog />
    </div>
  );
}
