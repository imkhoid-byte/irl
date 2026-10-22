import Link from "next/link";
import { clsx } from "clsx";
import type { PublicProfile } from "@/server/services/profiles";
import { INTENTIONS } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("font-display text-[26px] leading-none tracking-[0.14em]", className)}>
      ONCE
    </span>
  );
}

export function DemoBadge({ children = "Demo data", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full border border-amber-ink/25 bg-amber px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-amber-ink", className)}>
      {children}
    </span>
  );
}

const STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "good" | "warn" | "muted" }> = {
  pending: { label: "Awaiting response", tone: "warn" },
  awaiting_commitment: { label: "Awaiting commitment", tone: "accent" },
  confirmed: { label: "Confirmed", tone: "good" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
  declined: { label: "Declined", tone: "muted" },
  withdrawn: { label: "Withdrawn", tone: "muted" },
  accepted: { label: "Accepted", tone: "good" },
  interested: { label: "Interested", tone: "neutral" },
  refunded: { label: "Refunded", tone: "neutral" },
  partially_refunded: { label: "Partially refunded", tone: "neutral" },
  authorized: { label: "Committed (hold)", tone: "good" },
  captured: { label: "Paid", tone: "good" },
  failed: { label: "Failed", tone: "warn" },
  canceled: { label: "Released", tone: "muted" },
  processing: { label: "Processing", tone: "warn" },
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium",
        s.tone === "accent" && "bg-blush text-oxblood",
        s.tone === "good" && "bg-sage text-sage-ink",
        s.tone === "warn" && "bg-amber text-amber-ink",
        s.tone === "neutral" && "bg-line/60 text-ink-soft",
        s.tone === "muted" && "bg-line/40 text-muted",
        className,
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", s.tone === "good" ? "bg-sage-ink" : s.tone === "accent" ? "bg-oxblood" : s.tone === "warn" ? "bg-amber-ink" : "bg-muted")} />
      {s.label}
    </span>
  );
}

export function Avatar({ profile, size = 56, className }: { profile: { firstName: string; photoIds: string[] }; size?: number; className?: string }) {
  const photo = profile.photoIds[0];
  return (
    <div
      className={clsx("relative shrink-0 overflow-hidden rounded-full bg-blush", className)}
      style={{ width: size, height: size }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/photos/${photo}`} alt={profile.firstName} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blush to-line font-display text-oxblood" style={{ fontSize: size * 0.46 }}>
          {profile.firstName.slice(0, 1)}
        </div>
      )}
    </div>
  );
}

export function PortraitPhoto({ profile, className }: { profile: { firstName: string; photoIds: string[] }; className?: string }) {
  const photo = profile.photoIds[0];
  return (
    <div className={clsx("relative overflow-hidden bg-blush", className)}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/photos/${photo}`} alt={profile.firstName} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blush via-[#ead6cf] to-line">
          <span className="font-display text-[88px] leading-none text-oxblood/80">{profile.firstName.slice(0, 1)}</span>
        </div>
      )}
      <div className="grain pointer-events-none absolute inset-0 mix-blend-multiply" />
    </div>
  );
}

export function Reliability({ profile }: { profile: PublicProfile }) {
  const r = profile.reliability;
  return (
    <Link href="/policies#reliability" className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink" title="How reliability works">
      <span className={clsx("h-1.5 w-1.5 rounded-full", r.tier === "reliable" || r.tier === "consistent" ? "bg-sage-ink" : "bg-line-strong")} />
      {r.label}
    </Link>
  );
}

export function ProfileCard({ profile, footer, compact }: { profile: PublicProfile; footer?: React.ReactNode; compact?: boolean }) {
  return (
    <div className="card overflow-hidden">
      <div className={clsx("grid", compact ? "grid-cols-[96px_1fr]" : "sm:grid-cols-[180px_1fr]")}>
        <PortraitPhoto profile={profile} className={compact ? "h-full min-h-[120px]" : "aspect-[4/5] sm:aspect-auto sm:h-full"} />
        <div className="p-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="display text-[30px]">
              {profile.firstName}, {profile.age}
            </h3>
            {profile.verified && (
              <span className="rounded-full bg-sage px-2 py-0.5 text-[11px] font-medium text-sage-ink">
                ID verified{profile.verificationIsTest ? " (test)" : ""}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">
            {profile.neighborhood}
            {profile.distanceKm !== null && ` · about ${profile.distanceKm} km away`}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{profile.bio}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {profile.interests.map((i) => (
              <span key={i} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-soft">
                {i}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
            <span>{INTENTIONS[profile.intention]}</span>
            <Reliability profile={profile} />
          </div>
          {footer && <div className="mt-5">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function PriceTable({ totalCents, shareCents, feeCents, isTest = true }: { totalCents: number; shareCents: number; feeCents: number; isTest?: boolean }) {
  return (
    <dl className="divide-y divide-line text-[14px]">
      <div className="flex justify-between py-2.5">
        <dt className="text-muted">Date total</dt>
        <dd>{formatMoney(totalCents)}</dd>
      </div>
      <div className="flex justify-between py-2.5">
        <dt className="text-muted">Your half</dt>
        <dd>{formatMoney(shareCents)}</dd>
      </div>
      <div className="flex justify-between py-2.5">
        <dt className="text-muted">ONCE service fee</dt>
        <dd>{formatMoney(feeCents)}</dd>
      </div>
      <div className="flex justify-between py-3 text-[16px] font-medium">
        <dt>You pay</dt>
        <dd>
          {formatMoney(shareCents + feeCents)}
          {isTest && <span className="ml-2 align-middle text-[11px] font-normal uppercase tracking-wider text-amber-ink">test</span>}
        </dd>
      </div>
    </dl>
  );
}

export function Notice({ tone = "neutral", title, children, className }: { tone?: "neutral" | "warn" | "good" | "accent"; title?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-2xl px-5 py-4 text-[14px] leading-relaxed",
        tone === "neutral" && "bg-line/40 text-ink-soft",
        tone === "warn" && "bg-amber text-amber-ink",
        tone === "good" && "bg-sage text-sage-ink",
        tone === "accent" && "bg-blush text-oxblood",
        className,
      )}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? "mt-1 opacity-90" : ""}>{children}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card px-6 py-12 text-center">
      <p className="display text-[28px]">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-8 animate-rise">
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <h1 className="display text-[44px] sm:text-[56px]">{title}</h1>
      {children && <div className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">{children}</div>}
    </header>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
      <span aria-hidden>←</span> {children}
    </Link>
  );
}
