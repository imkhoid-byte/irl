import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExperienceArt } from "@/components/experience-art";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, DemoBadge, Notice, PriceTable, ProfileCard, StatusPill } from "@/components/ui";
import { respondInvitationAction } from "@/app/actions/dates";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { getInvitation } from "@/server/services/dates";
import { AppError } from "@/server/errors";
import { requireMember } from "@/server/session";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  let inv;
  try {
    inv = getInvitation(getDb(), user.id, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  if (inv.matchId) redirect(`/matches/${inv.matchId}`);
  const o = inv.opportunity;
  const expired = inv.status === "pending" && new Date(inv.expiresAt) <= new Date();

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/my-dates?tab=invitations">My Dates</BackLink>
      <p className="eyebrow mb-3">{inv.direction === "received" ? (inv.isRepeat ? "A second date" : "You're invited") : "Your invitation"}</p>
      <h1 className="display text-[44px] sm:text-[56px]">
        {inv.direction === "received" ? <>{inv.other.firstName} would like to take you to <em>{o.title.toLowerCase()}.</em></> : <>You invited {inv.other.firstName}.</>}
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusPill status={expired ? "expired" : inv.status} />
        {inv.status === "pending" && !expired && <span className="text-[13px] text-muted">Expires {formatRelative(inv.expiresAt)}</span>}
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-[1fr_1fr]">
        <div className="card overflow-hidden">
          <ExperienceArt category={o.category} className="aspect-[16/10]" />
          <div className="p-5">
            <div className="flex items-center justify-between">
              <p className="display text-[26px]">{o.title}</p>
              {o.isDemo && <DemoBadge>Demo</DemoBadge>}
            </div>
            <p className="mt-2 text-[14px] text-ink-soft">{formatDateTime(o.startsAt)} · {formatDuration(o.durationMinutes)}</p>
            <p className="text-[13px] text-muted">{o.venueType} · {o.neighborhood}</p>
            <p className="mt-3 text-[13px] text-muted">Free cancellation until {formatDateTime(o.cancellationDeadline)}</p>
            <Link href={`/dates/${o.slotId}`} className="btn-quiet mt-4 text-[13px]">Full details</Link>
          </div>
        </div>
        <div className="card p-5">
          <p className="eyebrow mb-2">If you both commit</p>
          <PriceTable totalCents={o.price.totalCents} shareCents={o.price.shareCents} feeCents={o.price.feeCents} />
          <p className="mt-2 text-[12px] leading-relaxed text-muted">Saying yes is free. Next, you&apos;ll both confirm these exact details and commit your half. Nobody is charged unless you both do.</p>
        </div>
      </div>

      <div className="mt-5">
        <ProfileCard profile={inv.other} />
      </div>

      {inv.direction === "received" && inv.status === "pending" && !expired && (
        <ActionForm action={respondInvitationAction} className="sticky bottom-20 z-10 mt-8 rounded-2xl border border-line bg-paper/95 p-4 backdrop-blur sm:bottom-4">
          <input type="hidden" name="invitationId" value={inv.id} />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SubmitButton className="btn-ghost" name="decision" value="decline" pendingText="…">Not this time</SubmitButton>
            <SubmitButton className="btn-primary sm:min-w-56" name="decision" value="accept" pendingText="Holding the table…">Yes, I&apos;m in</SubmitButton>
          </div>
        </ActionForm>
      )}
      {expired && <Notice tone="warn" className="mt-8">This invitation has expired. Nothing was charged.</Notice>}
      <p className="mt-8 text-center text-[13px] text-muted">
        Something not right? <Link href={`/report/${inv.other.userId}`} className="underline underline-offset-4">Report or block {inv.other.firstName}</Link>
      </p>
    </div>
  );
}
