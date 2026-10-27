"use client";
import { Mountain, Menu, X, Home, Plus, LayoutDashboard, ShieldCheck, LogOut, User, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useView } from "@/stores/view-store";
import { useUI } from "@/stores/ui-store";
import { useSession, signOut } from "next-auth/react";
import { useNotifications } from "@/hooks/use-notifications";
import { useChatNotifications } from "@/hooks/use-chat-notifications";
import { NotificationDot } from "@/components/gb-rent/notification-dot";
import { cn } from "@/lib/utils";

const NAV = [
  { name: "home" as const, label: "Browse", icon: Home, auth: false, admin: false },
  { name: "create" as const, label: "List a property", icon: Plus, auth: true, admin: false },
  { name: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard, auth: true, admin: false },
  { name: "admin" as const, label: "Admin", icon: ShieldCheck, auth: true, admin: true },
];

export function Header() {
  const { current, go } = useView();
  const openAuth = useUI((s) => s.openAuth);
  const { data: session, status } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { adminPending, userUnread } = useNotifications();
  const chatUnread = useChatNotifications();

  const user = session?.user;
  const isAdmin = user?.role === "ADMIN";
  const initials = user?.name?.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() ?? "U";

  // Show every non-admin item to everyone; admin item only to admins.
  // Auth-required items prompt the sign-in dialog when clicked by an
  // unauthenticated user — better UX than hiding them entirely.
  const navItems = NAV.filter((n) => !n.admin || isAdmin);

  const handleNav = (name: (typeof NAV)[number]["name"]) => {
    const item = NAV.find((n) => n.name === name);
    if (item?.auth && status !== "authenticated") {
      openAuth("login");
    } else {
      go({ name });
    }
    setMobileOpen(false);
  };

  const isActive = (name: typeof NAV[number]["name"]) => current.name === name;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Brand */}
        <button
          onClick={() => go({ name: "home" })}
          className="flex items-center gap-2.5 outline-none"
          aria-label="GB Rent home"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Mountain className="size-5" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-lg font-bold tracking-tight">GB Rent</span>
            <span className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:block">
              Gilgit-Baltistan Rentals
            </span>
          </span>
        </button>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((n) => (
            <Button
              key={n.name}
              variant={isActive(n.name) ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleNav(n.name)}
              className="gap-2"
            >
              <n.icon className="size-4" />
              {n.label}
              {/* Notification dots — admin (pending approvals, emerald) and
                  dashboard (unread inquiries, amber). Only shown when the
                  relevant count > 0. */}
              {n.name === "admin" && adminPending > 0 && (
                <NotificationDot count={adminPending} tone="emerald" />
              )}
              {n.name === "dashboard" && userUnread > 0 && (
                <NotificationDot count={userUnread} tone="amber" />
              )}
            </Button>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button variant={current.name === "chat" ? "secondary" : "ghost"} size="sm" onClick={() => status === "authenticated" ? go({ name: "chat" }) : openAuth("login")} className="gap-2">
            <MessageCircle className="size-4" /> Messages
            {chatUnread > 0 && <NotificationDot count={chatUnread} tone="amber" />}
          </Button>
        </div>

        {/* Right: auth */}
        <div className="flex items-center gap-2">
          {status === "authenticated" && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 px-1.5">
                  <Avatar className="size-7 border">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[120px] truncate text-sm font-medium sm:inline">
                    {user.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="font-medium">{user.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => go({ name: "chat" })}>
                  <MessageCircle className="size-4" /> Messages
                  {chatUnread > 0 && <NotificationDot count={chatUnread} tone="amber" className="ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => go({ name: "dashboard" })}>
                  <LayoutDashboard className="size-4" /> Dashboard
                  {userUnread > 0 && <NotificationDot count={userUnread} tone="amber" className="ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => go({ name: "create" })}>
                  <Plus className="size-4" /> List a property
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => go({ name: "admin" })}>
                    <ShieldCheck className="size-4" /> Admin panel
                    {adminPending > 0 && <NotificationDot count={adminPending} tone="emerald" className="ml-auto" />}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : status === "unauthenticated" ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Button variant="ghost" size="sm" onClick={() => openAuth("login")}>
                Sign in
              </Button>
              <Button size="sm" onClick={() => openAuth("signup")}>
                Get started
              </Button>
            </div>
          ) : (
            <div className="hidden sm:block">
              <Button variant="ghost" size="sm" disabled>
                <User className="size-4" /> Loading…
              </Button>
            </div>
          )}

          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <SheetHeader className="border-b">
                <SheetTitle className="flex items-center gap-2">
                  <Mountain className="size-5 text-primary" /> GB Rent
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 p-3">
                <Button variant="ghost" className="justify-start gap-2" onClick={() => { if (status === "authenticated") go({ name: "chat" }); else openAuth("login"); setMobileOpen(false); }}>
                  <MessageCircle className="size-4" /> <span className="flex-1 text-left">Messages</span>
                  {chatUnread > 0 && <NotificationDot count={chatUnread} tone="amber" />}
                </Button>
                {navItems.map((n) => (
                  <Button
                    key={n.name}
                    variant={isActive(n.name) ? "secondary" : "ghost"}
                    className="justify-start gap-2"
                    onClick={() => handleNav(n.name)}
                  >
                    <n.icon className="size-4" />
                    <span className="flex-1 text-left">{n.label}</span>
                    {n.name === "admin" && adminPending > 0 && (
                      <NotificationDot count={adminPending} tone="emerald" />
                    )}
                    {n.name === "dashboard" && userUnread > 0 && (
                      <NotificationDot count={userUnread} tone="amber" />
                    )}
                  </Button>
                ))}
                {status === "unauthenticated" && (
                  <>
                    <Button
                      variant="outline"
                      className="mt-2 justify-start gap-2"
                      onClick={() => {
                        openAuth("login");
                        setMobileOpen(false);
                      }}
                    >
                      Sign in
                    </Button>
                    <Button
                      className="justify-start gap-2"
                      onClick={() => {
                        openAuth("signup");
                        setMobileOpen(false);
                      }}
                    >
                      Create account
                    </Button>
                  </>
                )}
                {status === "authenticated" && (
                  <Button
                    variant="outline"
                    className="mt-2 justify-start gap-2 text-destructive"
                    onClick={() => {
                      signOut({ callbackUrl: "/" });
                      setMobileOpen(false);
                    }}
                  >
                    <LogOut className="size-4" /> Sign out
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
