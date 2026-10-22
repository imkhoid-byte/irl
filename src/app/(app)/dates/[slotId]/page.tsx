import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExperienceArt } from "@/components/experience-art";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, DemoBadge, EmptyState, Notice, ProfileCard } from "@/components/ui";
import { inviteAction } from "@/app/actions/dates";
import { CATEGORIES } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { formatDateTime, formatDuration } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { candidatesForSlot, getOpportunity, isBookable } from "@/server/services/discovery";
import { requireMember } from "@/server/session";

export const metadata: Metadata = { title: "Date details" };

export default async function DateDetail({ params }: { params: Promise<{ slotId: string }> }) {
  const user = await requireMember();
  const { slotId } = await params;
  const db = getDb();
  const o = getOpportunity(db, slotId, user.id);
  if (!o) notFound();
  const available = o.status === "open" && o.datesLeft > 0 && isBookable(o.startsAt);
  const candidates = available ? candidatesForSlot(db, user.id, slotId) : [];

  return (
    <div>
      <BackLink href="/discover">All dates</BackLink>
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="animate-rise">
          <ExperienceArt category={o.category} className="aspect-[16/10] rounded-3xl" label={o.title} />
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="eyebrow">{CATEGORIES[o.category].label}</span>
            {o.isDemo && <DemoBadge>Demo experience · simulated inventory</DemoBadge>}
          </div>
          <h1 className="display mt-3 text-[48px] sm:text-[60px]">{o.title}</h1>
          <p className="mt-3 text-[17px] text-ink-soft">{formatDateTime(o.startsAt)} · {formatDuration(o.durationMinutes)}</p>
          <p className="mt-1 text-[14px] text-muted">
            {o.venueType} · {o.neighborhood}{o.distanceKm !== null && ` · about ${o.distanceKm} km from you`}
          </p>
          <p className="mt-6 text-[16px] leading-relaxed text-ink-soft">{o.description}</p>
          <p className="mt-4 font-display text-[22px] italic text-oxblood">{o.atmosphere}</p>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <div className="flex items-baseline justify-between">
              <p className="display text-[40px]">{formatMoney(o.price.shareCents)}<span className="ml-1 font-sans text-[14px] text-muted">each</span></p>
              <p className="text-[13px] text-muted">{formatMoney(o.price.totalCents)} total</p>
            </div>
            <p className="mt-1 text-[13px] text-muted">+ {formatMoney(o.price.feeCents)} ONCE service fee per person, shown again before you commit.</p>
            <div className="rule my-5" />
            <p className="eyebrow mb-3">Included</p>
            <ul className="space-y-2 text-[14px]">
              {o.includes.map((i) => (
                <li key={i} className="flex gap-2.5"><span className="text-oxblood">—</span>{i}</li>
              ))}
            </ul>
            <div className="rule my-5" />
            <dl className="space-y-2.5 text-[13px]">
              <div className="flex justify-between gap-4"><dt className="text-muted">Free cancellation until</dt><dd className="text-right">{formatDateTime(o.cancellationDeadline)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Setting</dt><dd>{o.indoor ? "Indoor" : "Outdoor"}</dd></div>
              {o.dressCode && <div className="flex justify-between gap-4"><dt className="text-muted">Dress</dt><dd className="text-right">{o.dressCode}</dd></div>}
              {o.accessibility && <div className="flex justify-between gap-4"><dt className="text-muted">Access</dt><dd className="text-right">{o.accessibility}</dd></div>}
              {o.dietary && <div className="flex justify-between gap-4"><dt className="text-muted">Food & drink</dt><dd className="text-right">{o.dietary}</dd></div>}
              <div className="flex justify-between gap-4"><dt className="text-muted">Availability</dt><dd>{o.datesLeft} {o.datesLeft === 1 ? "table" : "tables"} left</dd></div>
            </dl>
            <p className="mt-5 text-[12px] leading-relaxed text-muted">The venue name and exact address are shared with both of you once the date is confirmed.</p>
          </div>
        </aside>
      </div>

      <section className="mt-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="eyebrow mb-2">Who&apos;d go with you</p>
            <h2 className="display text-[36px]">People who&apos;d enjoy this date</h2>
          </div>
          <p className="max-w-xs text-[13px] leading-relaxed text-muted">Inviting is free. If they say yes, you&apos;ll both confirm and commit {formatMoney(o.price.dueCents)} each.</p>
        </div>
        {!available ? (
          <Notice tone="warn" title="This date is no longer available.">It may have filled up or be too soon to book. Try another time.</Notice>
        ) : candidates.length === 0 ? (
          <EmptyState title="No one just yet.">Nobody nearby has this kind of date on their list for this time. Check back soon, or try another slot.</EmptyState>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {candidates.map((c) => (
              <ProfileCard
                key={c.userId}
                profile={c}
                compact
                footer={
                  <div className="space-y-3">
                    {(c.sharedInterests.length > 0 || c.likesThisKind) && (
                      <p className="text-[12px] text-oxblood">
                        {c.likesThisKind && "Loves this kind of date"}
                        {c.likesThisKind && c.sharedInterests.length > 0 && " · "}
                        {c.sharedInterests.length > 0 && `You both like ${c.sharedInterests.join(", ")}`}
                      </p>
                    )}
                    {c.invited ? (
                      <p className="text-[13px] text-muted">Invited · awaiting their answer</p>
                    ) : (
                      <ActionForm action={inviteAction}>
                        <input type="hidden" name="slotId" value={o.slotId} />
                        <input type="hidden" name="toUserId" value={c.userId} />
                        <SubmitButton className="btn-dark w-full py-2.5 text-[14px]" pendingText="Sending…">Invite {c.firstName} to this date</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
