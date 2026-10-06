import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "GB Rent — Rental Marketplace for Gilgit-Baltistan",
  description:
    "Find and list rental properties across Gilgit-Baltistan — shops, houses, rooms and hostels in Gilgit, Hunza, Skardu and beyond. AI-assisted fair pricing and similar-property matching.",
  keywords: [
    "Gilgit-Baltistan rent",
    "Gilgit rent",
    "Hunza rent",
    "Skardu rent",
    "rental marketplace Pakistan",
    "GB Rent",
  ],
  authors: [{ name: "GB Rent" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
