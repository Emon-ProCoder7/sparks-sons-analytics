"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, X, LogOut } from "lucide-react";
import { motion } from "motion/react";
import { NAV } from "@/lib/site";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  // The active marker slides between items (shared layout animation); one id per nav copy.
  const nav = (id: string) => (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`font-display relative rounded-[4px] px-4 py-2.5 text-[0.92rem] transition-colors ${active ? "text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}
          >
            {active && (
              <motion.span
                layoutId={`nav-active-${id}`}
                aria-hidden
                className="absolute inset-0 rounded-[4px] border-l-4 border-orange bg-white/10"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            )}
            <span className="relative">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="hidden flex-col bg-steel px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="mb-8 rounded-[4px] bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sparks-logo.png" alt="F. Sparks & Sons" className="h-auto w-full" />
        </div>
        {nav("desk")}
        <div className="mt-auto border-t border-white/10 pt-4 text-xs text-white/50">
          <p>Managed by Truetel</p>
          <button onClick={signOut} className="mt-2 inline-flex items-center gap-1.5 text-white/70 hover:text-white">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-steel px-4 py-3 lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sparks-logo.png" alt="F. Sparks & Sons" className="h-7 w-auto rounded-[3px] bg-white p-1" />
        <button aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)} className="p-1 text-white">
          {open ? <X /> : <Menu />}
        </button>
      </header>
      {open && <div className="fixed inset-x-0 top-[52px] z-20 bg-steel px-4 pb-6 pt-2 lg:hidden">{nav("mob")}</div>}

      <div className="min-w-0">{children}</div>
    </div>
  );
}
