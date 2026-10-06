"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Loader2, Mountain } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useUI } from "@/stores/ui-store";
import { useView } from "@/stores/view-store";
import { apiFetch, ApiError } from "@/lib/api-fetch";
import type { UserDTO } from "@/types";

/** Combined login / signup dialog controlled by the UI store. */
export function AuthDialog() {
  const { authOpen, authMode, setAuthMode, closeAuth } = useUI();
  const go = useView((s) => s.go);

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm((s) => ({ ...s, [k]: v }));

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      toast.error("Invalid email or password");
      return;
    }
    toast.success("Welcome back!");
    closeAuth();
    setForm({ name: "", email: "", password: "", phone: "" });
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await apiFetch<UserDTO>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone || undefined,
        }),
      });
      // Auto sign-in after signup
      const res = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      setLoading(false);
      if (res?.error) {
        toast.error("Account created — please sign in");
        setAuthMode("login");
      } else {
        toast.success("Account created. Welcome to GB Rent!");
        closeAuth();
        setForm({ name: "", email: "", password: "", phone: "" });
      }
    } catch (e) {
      setLoading(false);
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error("Could not create account");
      }
    }
  };

  return (
    <Dialog open={authOpen} onOpenChange={(o) => (o ? null : closeAuth())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Mountain className="size-4" />
            </span>
            GB Rent account
          </DialogTitle>
          <DialogDescription>
            One account lets you list properties AND search for rentals.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={authMode} onValueChange={(v) => setAuthMode(v as "login" | "signup")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={onLogin} className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" disabled={loading} className="mt-2">
                {loading && <Loader2 className="size-4 animate-spin" />}
                Sign in
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Try the demo admin: <code className="font-mono">admin@gbrent.pk</code> / <code className="font-mono">admin123</code>
              </p>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={onSignup} className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="su-name">Full name</Label>
                <Input
                  id="su-name"
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Ali Khan"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="su-email">Email</Label>
                <Input
                  id="su-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="su-phone">Phone (optional)</Label>
                <Input
                  id="su-phone"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="03xx-xxxxxxx"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="su-password">Password (min 6 chars)</Label>
                <Input
                  id="su-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" disabled={loading} className="mt-2">
                {loading && <Loader2 className="size-4 animate-spin" />}
                Create account
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
