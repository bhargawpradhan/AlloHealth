import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Toaster } from "sonner";
import { Activity, Boxes, Droplets, PackagePlus, ShieldCheck, UserRound } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aegis Inventory Reservations",
  description: "Concurrency-safe commerce inventory reservations with MongoDB and Next.js"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="liquid-stage" />
        <div className="bubble-field" aria-hidden="true">
          <span style={{ "--left": "8%", "--size": "42px", "--speed": "16s", "--delay": "-2s", "--drift": "36px" } as CSSProperties} />
          <span style={{ "--left": "19%", "--size": "18px", "--speed": "12s", "--delay": "-8s", "--drift": "-28px" } as CSSProperties} />
          <span style={{ "--left": "34%", "--size": "64px", "--speed": "22s", "--delay": "-4s", "--drift": "54px" } as CSSProperties} />
          <span style={{ "--left": "51%", "--size": "28px", "--speed": "15s", "--delay": "-11s", "--drift": "-44px" } as CSSProperties} />
          <span style={{ "--left": "68%", "--size": "52px", "--speed": "19s", "--delay": "-7s", "--drift": "32px" } as CSSProperties} />
          <span style={{ "--left": "83%", "--size": "22px", "--speed": "13s", "--delay": "-3s", "--drift": "-24px" } as CSSProperties} />
          <span style={{ "--left": "94%", "--size": "76px", "--speed": "25s", "--delay": "-14s", "--drift": "-62px" } as CSSProperties} />
        </div>
        <div className="pointer-events-none fixed inset-0 grid-lines opacity-70" />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,7,17,0.58)_72%)]" />
        <header className="fixed left-0 right-0 top-0 z-50 px-4 pt-4 sm:px-8">
          <nav className="aqua-nav mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-lg px-4 py-3">
            <Link href="/" className="flex min-w-fit items-center gap-3 text-white">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-cyanGlow/15 text-cyanGlow shadow-neon">
                <Droplets className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold tracking-normal">Aegis Liquid Stock</span>
                <span className="block text-[11px] uppercase tracking-[0.22em] text-slate-400">3D inventory control</span>
              </span>
            </Link>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <Link href="/#reserve" className="nav-pill inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-100 transition">
                <UserRound className="h-4 w-4 text-acid" />
                Reserve
              </Link>
              <Link href="/#add-stock" className="nav-pill inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-100 transition">
                <PackagePlus className="h-4 w-4 text-cyanGlow" />
                Add Stock
              </Link>
              <Link href="/#activity" className="nav-pill inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-100 transition">
                <Activity className="h-4 w-4 text-violetGlow" />
                Activity
              </Link>
              <Link href="/#products" className="nav-pill inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-100 transition">
                <Boxes className="h-4 w-4 text-cyanGlow" />
                Products
              </Link>
              <Link href="/" className="nav-pill hidden items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-100 transition md:inline-flex">
                <ShieldCheck className="h-4 w-4 text-acid" />
                Checkout
              </Link>
            </div>
          </nav>
        </header>
        {children}
        <Toaster
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "border-white/15 bg-ink/90 text-white backdrop-blur-xl shadow-neon"
            }
          }}
        />
      </body>
    </html>
  );
}
