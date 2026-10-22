import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { ExperienceArt } from "@/components/experience-art";
import { ActionForm, Countdown, SubmitButton } from "@/components/forms";
import { BackLink, DemoBadge, Notice, PriceTable, ProfileCard, StatusPill } from "@/components/ui";
import { attendAction, respondRescheduleAction, simulateHappenedAction, withdrawRescheduleAction } from "@/app/actions/dates";
import { formatMoney } from "@/lib/money";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/time";
import { isDemoMode } from "@/server/context";
import { requireMember } from "@/server/session";
import { loadMatch } from "./load";

export const metadata: Metadata = { title: "Your date" };

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-[14px]">
      <span className={clsx("flex h-5 w-5 items-center justify-center rounded-full text-[11px]", done ? "bg-sage-ink text-paper" : "border border-line-strong text-transparent")}>✓</span>
      <span className={done ? "text-ink" : "text-muted"}>{label}</span>
    </li>
  );
}

export default async function MatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const m = loadMatch(user.id, id);
  const o = m.opportunity;
  const other = m.other.profile;
  const end = new Date(new Date(o.startsAt).getTime() + o.durationMinutes * 60_000);
  const mapsUrl = m.venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${m.venue.name} ${m.venue.address.replace(" (demo address)", "")} New York`)}` : null;

  return (
    <div>
      <BackLink href="/my-dates">My Dates</BackLink>

      {sp.committed && m.status === "awaiting_commitment" && <Notice tone="good" className="mb-6" title="You're committed.">Your half is on hold, not charged. We&apos;ll confirm the date the moment {other.firstName} commits too.</Notice>}
      {sp.committed && m.status === "confirmed" && <Notice tone="good" className="mb-6" title="It's a date.">You both committed and the table is secured. See you there.</Notice>}
      {sp.checked && <Notice tone="good" className="mb-6">Thanks — your answers are private.</Notice>}
      {sp.moved === "requested" && <Notice className="mb-6">Time change proposed. Nothing changes unless {other.firstName} agrees.</Notice>}
      {sp.invited && <Notice tone="good" className="mb-6">Second date invitation sent to {other.firstName}.</Notice>}

      <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusPill status={m.status} />
              {m.isTest && <DemoBadge>Test booking</DemoBadge>}
            </div>
            <h1 className="display text-[44px] sm:text-[58px]">
              {m.status === "awaiting_commitment" && <>Almost a date.</>}
              {m.status === "confirmed" && <>It&apos;s a date.</>}
              {m.status === "completed" && <>How did it go?</>}
              {m.status === "cancelled" && <>This date was cancelled.</>}
              {m.status === "expired" && <>This one didn&apos;t come together.</>}
            </h1>
            <p className="mt-3 text-[17px] text-ink-soft">
              {o.title} with {other.firstName} · {formatDateTime(o.startsAt)}
            </p>
          </div>

          {/* ---------------- Awaiting commitment ---------------- */}
          {m.status === "awaiting_commitment" && (
            <div className="card p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="eyebrow">Both of you commit to lock it in</p>
                <p className="text-[13px] text-muted">Closes in <Countdown to={m.commitmentExpiresAt} className="font-medium text-ink" /></p>
              </div>
              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-[14px] font-medium">You</p>
                  <ul className="space-y-2">
                    <Step done={m.me.detailsConfirmed} label="Confirmed the details" />
                    <Step done={m.me.committed} label={`Committed ${formatMoney(m.price.dueCents)}`} />
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-[14px] font-medium">{other.firstName}</p>
                  <ul className="space-y-2">
                    <Step done={m.other.detailsConfirmed} label="Confirmed the details" />
                    <Step done={m.other.committed} label="Committed their half" />
                  </ul>
                </div>
              </div>
              {m.me.payment?.status === "failed" && <Notice tone="warn" className="mt-5">Your last payment didn&apos;t go through: {m.me.payment.failureReason} Nothing was charged.</Notice>}
              <div className="mt-6">
                {m.me.committed ? (
                  <p className="text-[14px] leading-relaxed text-muted">
                    You&apos;re committed — {formatMoney(m.price.dueCents)} is on hold, not charged. If {other.firstName} doesn&apos;t commit by {formatDateTime(m.commitmentExpiresAt)}, the hold is released automatically.
                  </p>
                ) : (
                  <Link href={`/matches/${m.id}/commit`} className="btn-primary w-full sm:w-auto">Confirm &amp; commit {formatMoney(m.price.dueCents)}</Link>
                )}
              </div>
            </div>
          )}

          {/* ---------------- Confirmed itinerary ---------------- */}
          {(m.status === "confirmed" || m.status === "completed") && m.venue && (
            <div className="card overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-line bg-ink p-6 text-paper">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-paper/60">Your itinerary</p>
                  <p className="display mt-2 text-[30px]">{formatDateTime(o.startsAt)}</p>
                  <p className="text-[13px] text-paper/70">Until about {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(end)} · {formatDuration(o.durationMinutes)}</p>
                </div>
                {m.status === "confirmed" && (
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-paper/60">Starts in</p>
                    <Countdown to={o.startsAt} className="display text-[30px]" />
                  </div>
                )}
              </div>
              <dl className="divide-y divide-line px-6 text-[14px]">
                <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr]">
                  <dt className="text-muted">Where</dt>
                  <dd>
                    <p className="font-medium">{m.venue.name}</p>
                    <p className="text-ink-soft">{m.venue.address}</p>
                    <div className="mt-2 flex flex-wrap gap-4">
                      {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="btn-quiet text-[13px]">Directions</a>}
                      <a href={`/api/matches/${m.id}/calendar`} className="btn-quiet text-[13px]">Add to calendar</a>
                    </div>
                  </dd>
                </div>
                <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr]">
                  <dt className="text-muted">Reservation</dt>
                  <dd>
                    {m.reservation?.status === "secured" ? (
                      <>Secured · <span className="font-mono text-[13px]">{m.reservation.confirmationCode}</span>{m.reservation.isTest && <span className="ml-2 text-[11px] uppercase tracking-wider text-amber-ink">simulated</span>}</>
                    ) : (
                      <span className="text-amber-ink">Not yet secured</span>
                    )}
                  </dd>
                </div>
                <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr]"><dt className="text-muted">On arrival</dt><dd className="text-ink-soft">{m.venue.arrival_notes}</dd></div>
                {o.dressCode && <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr]"><dt className="text-muted">Dress</dt><dd className="text-ink-soft">{o.dressCode}</dd></div>}
                <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr]"><dt className="text-muted">Included</dt><dd className="text-ink-soft">{o.includes.join(" · ")}</dd></div>
                {m.status === "confirmed" && <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr]"><dt className="text-muted">Free cancellation</dt><dd className="text-ink-soft">{new Date(m.cancellationDeadline) > new Date() ? `Until ${formatDateTime(m.cancellationDeadline)}` : "Deadline passed — late-cancellation terms apply"}</dd></div>}
                {m.me.dietaryOrAccessNotes && <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr]"><dt className="text-muted">Your notes</dt><dd className="text-ink-soft">Your dietary/accessibility notes were shared privately with the venue.</dd></div>}
              </dl>
            </div>
          )}

          {m.status === "confirmed" && (
            <>
              <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-[15px] font-medium">{m.me.attendanceConfirmed ? "You've confirmed you'll be there." : "Let them know you'll be there."}</p>
                  <p className="text-[13px] text-muted">{m.other.attendanceConfirmed ? `${other.firstName} has confirmed they'll be there.` : `${other.firstName} hasn't confirmed yet.`}</p>
                </div>
                {!m.me.attendanceConfirmed && (
                  <form action={attendAction}>
                    <input type="hidden" name="matchId" value={m.id} />
                    <SubmitButton className="btn-dark py-2.5 text-[14px]">I&apos;ll be there</SubmitButton>
                  </form>
                )}
              </div>

              {m.reschedule ? (
                <div className="card p-5">
                  <p className="text-[15px] font-medium">{m.reschedule.byMe ? "You proposed a new time" : `${other.firstName} asked to move the date`}</p>
                  <p className="mt-1 text-[14px] text-ink-soft">Proposed: {m.reschedule.newSlot ? formatDateTime(m.reschedule.newSlot.startsAt) : "—"}. The original time stands unless both of you agree.</p>
                  {m.reschedule.byMe ? (
                    <form action={withdrawRescheduleAction} className="mt-4">
                      <input type="hidden" name="requestId" value={m.reschedule.id} />
                      <input type="hidden" name="matchId" value={m.id} />
                      <SubmitButton className="btn-ghost py-2 text-[13px]">Withdraw request</SubmitButton>
                    </form>
                  ) : (
                    <ActionForm action={respondRescheduleAction} className="mt-4">
                      <input type="hidden" name="requestId" value={m.reschedule.id} />
                      <input type="hidden" name="matchId" value={m.id} />
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton className="btn-dark py-2 text-[13px]" name="decision" value="accept">Accept new time</SubmitButton>
                        <SubmitButton className="btn-ghost py-2 text-[13px]" name="decision" value="decline">Keep original</SubmitButton>
                      </div>
                    </ActionForm>
                  )}
                </div>
              ) : null}
            </>
          )}

          {/* ---------------- After the date ---------------- */}
          {m.status === "completed" && (
            <div className="card p-6">
              {!m.feedback.submitted ? (
                <>
                  <p className="text-[16px]">Two minutes, completely private. Your answers are never shown to {other.firstName}.</p>
                  <Link href={`/matches/${m.id}/check-in`} className="btn-primary mt-5">Start check-in</Link>
                </>
              ) : m.feedback.mutualYes ? (
                <>
                  <p className="display text-[32px]">You both said yes.</p>
                  <p className="mt-2 text-[15px] text-ink-soft">See each other again? Pick another date — same rules: a real plan, both commit.</p>
                  {m.repeatInvitation ? (
                    <p className="mt-5 text-[14px] text-muted">
                      {m.repeatInvitation.fromMe ? `You invited ${other.firstName} to a second date.` : `${other.firstName} invited you to a second date.`}{" "}
                      {m.repeatInvitation.status === "pending" && !m.repeatInvitation.fromMe && <Link href={`/invitations/${m.repeatInvitation.id}`} className="underline">Reply</Link>}
                    </p>
                  ) : (
                    <Link href={`/matches/${m.id}/again`} className="btn-primary mt-5">Plan a second date</Link>
                  )}
                </>
              ) : m.feedback.bothSubmitted ? (
                <p className="text-[15px] leading-relaxed text-ink-soft">This one&apos;s closed. Thank you for showing up — that&apos;s the whole point.</p>
              ) : (
                <p className="text-[15px] leading-relaxed text-ink-soft">Thanks for checking in. If you both say yes to another date, we&apos;ll let you know here.</p>
              )}
            </div>
          )}

          {(m.status === "cancelled" || m.status === "expired") && (
            <div className="card p-6 text-[15px] leading-relaxed text-ink-soft">
              {m.status === "expired" && <p>Both commitments weren&apos;t completed in time, so the date didn&apos;t go ahead. Any hold on your card was released — you weren&apos;t charged.</p>}
              {m.status === "cancelled" && (
                <p>
                  {m.cancelReason === "could_not_confirm" ? "The venue couldn't secure the booking." : m.cancelledByMe ? "You cancelled this date." : m.cancelReason === "cancelled_by_support" ? "Our support team cancelled this date." : "This date was cancelled."}{" "}
                  {!m.me.payment || ["canceled", "failed"].includes(m.me.payment.status)
                    ? "You weren't charged."
                    : m.me.payment.refundedCents > 0
                      ? `${formatMoney(m.me.payment.refundedCents)} of your ${formatMoney(m.me.payment.amountCents)} was refunded.`
                      : "Under the late-cancellation policy, no refund was due."}
                </p>
              )}
              <Link href="/discover" className="btn-dark mt-5">Find another date</Link>
            </div>
          )}
        </div>

        {/* ---------------- Side column ---------------- */}
        <aside className="space-y-5">
          <div className="card overflow-hidden">
            <ExperienceArt category={o.category} className="aspect-[16/9]" />
            <div className="p-5">
              <p className="display text-[24px]">{o.title}</p>
              <p className="mt-1 text-[13px] text-muted">{o.venueType} · {o.neighborhood}</p>
              {!m.venue && m.status === "awaiting_commitment" && <p className="mt-3 text-[12px] text-muted">Venue name and address unlock once you&apos;re both committed.</p>}
              <div className="mt-4">
                <PriceTable totalCents={m.price.totalCents} shareCents={m.price.shareCents} feeCents={m.price.feeCents} isTest={m.isTest} />
              </div>
              {m.me.payment && (
                <p className="mt-1 text-[12px] text-muted">
                  Your payment: <StatusPill status={m.me.payment.status} className="ml-1 align-middle" />
                </p>
              )}
            </div>
          </div>

          <ProfileCard profile={other} compact />

          <div className="card divide-y divide-line text-[14px]">
            {m.status === "confirmed" && !m.reschedule && <Link href={`/matches/${m.id}/reschedule`} className="flex items-center justify-between px-5 py-3.5 hover:bg-line/30">Propose a different time <span aria-hidden>→</span></Link>}
            {(m.status === "confirmed" || m.status === "awaiting_commitment") && <Link href={`/matches/${m.id}/cancel`} className="flex items-center justify-between px-5 py-3.5 hover:bg-line/30">{m.status === "confirmed" ? "Cancel this date" : "Withdraw"} <span aria-hidden>→</span></Link>}
            <Link href={`/help?match=${m.id}`} className="flex items-center justify-between px-5 py-3.5 text-oxblood hover:bg-blush/40">Help &amp; safety <span aria-hidden>→</span></Link>
            <Link href={`/report/${other.userId}?match=${m.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-line/30">Report or block {other.firstName} <span aria-hidden>→</span></Link>
          </div>

          {m.status === "confirmed" && isDemoMode() && (
            <form action={simulateHappenedAction} className="rounded-2xl border border-dashed border-amber-ink/40 bg-amber/50 p-4">
              <input type="hidden" name="matchId" value={m.id} />
              <p className="text-[12px] font-medium uppercase tracking-wider text-amber-ink">Demo control</p>
              <p className="mt-1 text-[13px] text-amber-ink">Skip ahead to after the date (starts {formatRelative(o.startsAt)}) to try the post-date check-in.</p>
              <SubmitButton className="btn mt-3 border border-amber-ink/40 px-4 py-2 text-[13px] text-amber-ink hover:bg-amber">Simulate: the date happened</SubmitButton>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
