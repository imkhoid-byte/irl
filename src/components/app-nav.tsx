"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const ITEMS = [
  { href: "/discover", label: "Discover", match: ["/discover", "/dates"], icon: "M12 3l2.2 6.6H21l-5.5 4 2.1 6.6L12 16.2l-5.6 4 2.1-6.6L3 9.6h6.8z" },
  { href: "/my-dates", label: "My Dates", match: ["/my-dates", "/matches", "/invitations"], icon: "M5 5h14v15H5zM5 9h14M9 3v4M15 3v4" },
  { href: "/profile", label: "Profile", match: ["/profile", "/settings"], icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" },
];

export function DesktopNav() {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {ITEMS.map((i) => {
        const on = i.match.some((m) => path.startsWith(m));
        return (
          <Link key={i.href} href={i.href} className={clsx("rounded-full px-4 py-2 text-[14px] transition", on ? "bg-ink text-paper" : "text-ink-soft hover:text-ink")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ivory/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden" aria-label="Main">
      <div className="grid grid-cols-3">
        {ITEMS.map((i) => {
          const on = i.match.some((m) => path.startsWith(m));
          return (
            <Link key={i.href} href={i.href} className={clsx("flex flex-col items-center gap-1 py-2.5 text-[11px] tracking-wide", on ? "text-oxblood" : "text-muted")}>
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={on ? 1.9 : 1.5} strokeLinejoin="round" strokeLinecap="round">
                <path d={i.icon} />
              </svg>
              {i.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
