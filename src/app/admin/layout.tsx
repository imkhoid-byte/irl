import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge, Logo } from "@/components/ui";
import { requireAdmin } from "@/server/session";
import { AdminNav } from "./nav";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Server-side role check against the database. Non-admins get a 404.
  const admin = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3"><Link href="/admin"><Logo className="text-[22px]" /></Link><span className="eyebrow">Admin</span><DemoBadge /></div>
          <div className="flex items-center gap-4 text-[13px] text-muted"><span className="hidden sm:inline">{admin.email}</span><Link href="/discover" className="hover:text-ink">Exit</Link></div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[200px_1fr]">
        <aside><AdminNav /></aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
