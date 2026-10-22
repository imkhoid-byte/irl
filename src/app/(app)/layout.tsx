import Link from "next/link";
import { Logo } from "@/components/ui";
import { DesktopNav, MobileNav } from "@/components/app-nav";
import { getDb } from "@/server/db/client";
import { unreadCount } from "@/server/services/notifications";
import { requireMember } from "@/server/session";
import { isDemoMode } from "@/server/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireMember();
  const unread = unreadCount(getDb(), user.id);
  return (
    <div className="min-h-dvh pb-24 sm:pb-0">
      {isDemoMode() && (
        <div className="bg-ink px-4 py-1.5 text-center text-[11px] tracking-wide text-paper/80">
          Demo mode · sample venues &amp; people · test payments only — no real money moves
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-ivory/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/discover" aria-label="ONCE — Discover"><Logo /></Link>
          <DesktopNav />
          <div className="flex items-center gap-2">
            {user.isAdmin && <Link href="/admin" className="rounded-full border border-line-strong px-3 py-1.5 text-[12px] text-ink-soft hover:border-ink">Admin</Link>}
            <Link href="/notifications" className="relative rounded-full p-2 text-ink-soft hover:text-ink" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
              </svg>
              {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-oxblood px-1 text-[10px] font-medium text-paper">{unread}</span>}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">{children}</main>
      <MobileNav />
    </div>
  );
}
