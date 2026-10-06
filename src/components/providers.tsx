"use client";
/**
 * Root providers for the GB Rent SPA.
 * - SessionProvider: NextAuth client session (so useSession works in components)
 * - ThemeProvider: light/dark via next-themes
 * - QueryClientProvider: TanStack Query for server-state caching
 *
 * Also registers the global stale-session handler on window so that any
 * 401 from the API (caught in apiFetch or the upload path) triggers a
 * clean "please sign in again" flow instead of a confusing error.
 */
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster as SonnerToaster } from "sonner";
import { handleStaleSession } from "@/lib/stale-session";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  // Register the stale-session handler on window so apiFetch + the upload
  // helper can call it without importing client-only code into server files.
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { __gbStaleSession?: () => void }).__gbStaleSession = handleStaleSession;
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as unknown as { __gbStaleSession?: () => void }).__gbStaleSession;
      }
    };
  }, []);

  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        <QueryClientProvider client={client}>
          {children}
          <SonnerToaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              classNames: {
                toast: "rounded-xl border-border",
              },
            }}
          />
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
