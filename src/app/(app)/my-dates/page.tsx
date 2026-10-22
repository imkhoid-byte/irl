import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { ExperienceArt } from "@/components/experience-art";
import { Avatar, EmptyState, Notice, PageHeader, StatusPill } from "@/components/ui";
import { withdrawInvitationAction } from "@/app/actions/dates";
import { formatDateTime, formatRelative } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { listInvitations, listMatches } from "@/server/services/dates";
import { requireMember } from "@/server/session";

export const metadata: Metadata = { title: "My Dates" };

const TABS = [
  ["upcoming", "Upcoming"],
  ["invitations", "Invitations"],
  ["history", "History"],
] as const;

export default async function MyDates({ searchParams }: { searchParams: Promise<{ tab?: string; declined?: string; blocked?: string }> }) {
  const user = await requireMember();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab : "upcoming";
  const db = getDb();
  const matches = listMatches(db, user.id);
  const invitations = listInvitations(db, user.id);
  const upcoming = matches.filter((m) => m.status === "awaiting_commitment" || m.status === "confirmed").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const history = matches.filter((m) => !["awaiting_commitment", "confirmed"].includes(m.status));
  const received = invitations.filter((i) => i.direction === "received" && i.status === "pending");
  const sent = invitations.filter((i) => i.direction === "sent" && i.status === "pending");
  const closedInvites = invitations.filter((i) => i.status !== "pending");
  const checkIns = history.filter((m) => m.needsCheckIn);

  return (
    <div>
      <PageHeader eyebrow="My Dates" title="Your plans." />
      {sp.declined && <Notice className="mb-6">Declined — kindly and privately. They won&apos;t see a reason.</Notice>}
      {sp.blocked && <Notice tone="good" className="mb-6">Blocked. They can&apos;t see you or invite you, and anything you had planned together has been cancelled with full refunds.</Notice>}

      {(received.length > 0 || checkIns.length > 0) && (
        <div className="mb-8 space-y-3">
          {received.map((i) => (
            <Link key={i.id} href={`/invitations/${i.id}`} className="card flex items-center gap-4 border-oxblood/30 bg-blush/50 p-4 transition hover:border-oxblood">
              <Avatar profile={i.other} size={48} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">{i.other.firstName} {i.isRepeat ? "wants to see you again" : "invited you on a date"}</p>
                <p className="truncate text-[13px] text-muted">{i.opportunity.title} · {formatDateTime(i.opportunity.startsAt)}</p>
              </div>
              <span className="text-[12px] text-oxblood">Reply {formatRelative(i.expiresAt).replace("in ", "within ")}</span>
            </Link>
          ))}
          {checkIns.map((m) => (
            <Link key={m.id} href={`/matches/${m.id}/check-in`} className="card flex items-center justify-between gap-4 p-4 transition hover:border-ink">
              <div>
                <p className="text-[15px] font-medium">How was {m.title.toLowerCase()} with {m.otherName}?</p>
                <p className="text-[13px] text-muted">A private, two-minute check-in.</p>
              </div>
              <span className="btn-dark px-4 py-2 text-[13px]">Check in</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mb-6 flex gap-1 border-b border-line">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/my-dates?tab=${k}`} className={clsx("-mb-px border-b-2 px-4 py-3 text-[14px] transition", tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}>
            {label}
            {k === "invitations" && received.length + sent.length > 0 && <span className="ml-1.5 text-[12px] text-oxblood">{received.length + sent.length}</span>}
          </Link>
        ))}
      </div>

      {tab === "upcoming" &&
        (upcoming.length === 0 ? (
          <EmptyState title="No dates yet." action={<Link href="/discover" className="btn-primary">Find a date</Link>}>
            Pick a plan you&apos;d enjoy and invite someone who&apos;d enjoy it too.
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {upcoming.map((m) => (
              <Link key={m.id} href={`/matches/${m.id}`} className="card grid grid-cols-[96px_1fr] overflow-hidden transition hover:border-line-strong sm:grid-cols-[160px_1fr]">
                <ExperienceArt category={m.category} className="h-full min-h-28" />
                <div className="flex flex-col gap-2 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={m.status} />
                    {m.needsMyCommitment && <span className="text-[12px] font-medium text-oxblood">Your commitment needed</span>}
                  </div>
                  <p className="display text-[26px]">{m.title}</p>
                  <p className="text-[13px] text-muted">with {m.otherName} · {formatDateTime(m.startsAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        ))}

      {tab === "invitations" && (
        <div className="space-y-10">
          <section>
            <h2 className="eyebrow mb-3">Received</h2>
            {received.length === 0 ? <p className="text-[14px] text-muted">No invitations waiting for you.</p> : (
              <div className="space-y-3">
                {received.map((i) => (
                  <Link key={i.id} href={`/invitations/${i.id}`} className="card flex items-center gap-4 p-4 hover:border-ink">
                    <Avatar profile={i.other} size={44} />
                    <div className="flex-1">
                      <p className="text-[15px]">{i.other.firstName}, {i.other.age} · <span className="text-muted">{i.opportunity.title}</span></p>
                      <p className="text-[13px] text-muted">{formatDateTime(i.opportunity.startsAt)}</p>
                    </div>
                    <StatusPill status="pending" />
                  </Link>
                ))}
              </div>
            )}
          </section>
          <section>
            <h2 className="eyebrow mb-3">Sent</h2>
            {sent.length === 0 ? <p className="text-[14px] text-muted">You haven&apos;t invited anyone yet.</p> : (
              <div className="space-y-3">
                {sent.map((i) => (
                  <div key={i.id} className="card flex flex-wrap items-center gap-4 p-4">
                    <Avatar profile={i.other} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px]">{i.other.firstName} · <span className="text-muted">{i.opportunity.title}</span></p>
                      <p className="text-[13px] text-muted">{formatDateTime(i.opportunity.startsAt)} · expires {formatRelative(i.expiresAt)}</p>
                    </div>
                    <form action={withdrawInvitationAction}>
                      <input type="hidden" name="invitationId" value={i.id} />
                      <button className="btn-quiet text-[13px]">Withdraw</button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "history" &&
        (history.length === 0 && closedInvites.length === 0 ? (
          <EmptyState title="Nothing here yet.">Past dates and closed invitations will show up here.</EmptyState>
        ) : (
          <div className="space-y-3">
            {history.map((m) => (
              <Link key={m.id} href={`/matches/${m.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:border-line-strong">
                <div>
                  <p className="text-[15px]">{m.title} <span className="text-muted">with {m.otherName}</span></p>
                  <p className="text-[13px] text-muted">{formatDateTime(m.startsAt)}</p>
                </div>
                <StatusPill status={m.status} />
              </Link>
            ))}
            {closedInvites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-4 py-3">
                <p className="text-[14px] text-muted">
                  {i.direction === "sent" ? `You invited ${i.other.firstName}` : `${i.other.firstName} invited you`} · {i.opportunity.title}
                </p>
                <StatusPill status={i.status} />
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
