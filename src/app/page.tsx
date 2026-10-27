"use client";
import { useEffect } from "react";
import { PropertyChatbot } from "@/components/gb-rent/property-chatbot";
import { Header } from "@/components/gb-rent/header";
import { Footer } from "@/components/gb-rent/footer";
import { AuthDialog } from "@/components/gb-rent/auth-dialog";
import { useView } from "@/stores/view-store";
import { useUI } from "@/stores/ui-store";
import { HomeView } from "@/components/gb-rent/home-view";
import { DetailView } from "@/components/gb-rent/detail-view";
import { CreateEditView } from "@/components/gb-rent/create-edit-view";
import { DashboardView } from "@/components/gb-rent/dashboard-view";
import { AdminView } from "@/components/gb-rent/admin-view";
import { ChatView } from "@/components/gb-rent/chat-view";

/**
 * GB Rent — single-route SPA shell.
 * The shell renders a view based on the view-store.
 */
export default function Home() {
  const current = useView((s) => s.current);

  const viewKey =
    current.name === "detail" || current.name === "edit" ? current.propertyId : "";
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
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
        {current.name === "chat" && <ChatView conversationId={current.conversationId} />}
      </main>
      <Footer />
      <AuthDialog />
      <PropertyChatbot />
    </div>
  );
}
