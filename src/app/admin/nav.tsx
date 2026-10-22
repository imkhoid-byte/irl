"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const ITEMS = [
  ["/admin", "Outcomes"],
  ["/admin/reports", "Reports & disputes"],
  ["/admin/dates", "Dates & reservations"],
  ["/admin/payments", "Payments"],
  ["/admin/experiences", "Experiences"],
  ["/admin/venues", "Venues"],
  ["/admin/users", "Users"],
  ["/admin/settings", "Fees & policy"],
  ["/admin/audit", "Audit log"],
  ["/admin/outbox", "Email outbox"],
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:px-0">
      {ITEMS.map(([href, label]) => {
        const on = href === "/admin" ? path === "/admin" : path.startsWith(href);
        return (
          <Link key={href} href={href} className={clsx("shrink-0 rounded-lg px-3 py-2 text-[14px] transition", on ? "bg-ink text-paper" : "text-ink-soft hover:bg-line/50")}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
