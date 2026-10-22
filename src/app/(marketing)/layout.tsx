import Link from "next/link";
import { Logo } from "@/components/ui";
import { currentUser } from "@/server/session";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-transparent bg-ivory/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" aria-label="ONCE home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-5 text-[14px]">
            <Link href="/#how" className="hidden text-ink-soft hover:text-ink sm:inline">How it works</Link>
            <Link href="/policies" className="hidden text-ink-soft hover:text-ink sm:inline">Pricing & policies</Link>
            {user ? (
              <Link href={user.onboarded ? "/discover" : "/onboarding"} className="btn-dark px-5 py-2.5 text-[14px]">Open ONCE</Link>
            ) : (
              <>
                <Link href="/login" className="text-ink-soft hover:text-ink">Sign in</Link>
                <Link href="/register" className="btn-dark px-5 py-2.5 text-[14px]">Find my date</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 text-[13px] text-muted sm:grid-cols-[1.5fr_1fr_1fr] sm:px-8">
          <div>
            <Logo className="text-ink" />
            <p className="mt-3 max-w-sm leading-relaxed">You don&apos;t match to talk. You match to show up.</p>
            <p className="mt-4 max-w-sm leading-relaxed">
              This is a demonstration build. Venues, dates and people are sample data, and all payments use a simulated test provider — no real money moves.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="eyebrow mb-1">Product</p>
            <Link href="/#how" className="hover:text-ink">How it works</Link>
            <Link href="/policies#payments" className="hover:text-ink">Payments</Link>
            <Link href="/policies#cancellations" className="hover:text-ink">Cancellations</Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="eyebrow mb-1">Trust</p>
            <Link href="/policies#safety" className="hover:text-ink">Safety</Link>
            <Link href="/policies#guidelines" className="hover:text-ink">Community guidelines</Link>
            <Link href="/policies#privacy" className="hover:text-ink">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
