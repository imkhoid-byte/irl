import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, Notice, PageHeader } from "@/components/ui";
import { helpAction } from "@/app/actions/safety";
import { formatDateTime } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { getMatchView } from "@/server/services/dates";
import { requireMember } from "@/server/session";

export const metadata: Metadata = { title: "Help & safety" };

export default async function Help({ searchParams }: { searchParams: Promise<{ match?: string; unsafe?: string }> }) {
  const user = await requireMember();
  const sp = await searchParams;
  let match: ReturnType<typeof getMatchView> | null = null;
  try {
    match = sp.match ? getMatchView(getDb(), user.id, sp.match) : null;
  } catch {
    match = null;
  }
  const share = match?.venue
    ? `I'm on a date: ${match.opportunity.title} at ${match.venue.name}, ${match.venue.address}, ${formatDateTime(match.opportunity.startsAt)}. I'm meeting ${match.other.profile.firstName}.`
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      {match && <BackLink href={`/matches/${match.id}`}>Back to your date</BackLink>}
      <PageHeader eyebrow="Help & safety" title="We're here." />
      {sp.unsafe && <Notice tone="accent" className="mb-6" title="Thank you for telling us.">Our safety team has been alerted and will review this privately. If you&apos;re still in a difficult situation, the options below are for you.</Notice>}

      <div className="overflow-hidden rounded-3xl bg-oxblood p-6 text-paper sm:p-8">
        <p className="text-[12px] uppercase tracking-[0.18em] text-paper/70">In immediate danger?</p>
        <p className="display mt-2 text-[36px]">Call 911.</p>
        <p className="mt-2 text-[14px] leading-relaxed text-paper/85">Or your local emergency number. Go to staff at the venue — they can help you get somewhere safe.</p>
        <a href="tel:911" className="btn mt-5 bg-paper px-6 text-oxblood hover:bg-ivory">Call 911</a>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="card p-6">
          <p className="text-[15px] font-medium">Leaving early is always OK</p>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">You never owe anyone more time. If you leave because you felt unsafe, tell us and we&apos;ll handle it — including refunds.</p>
        </div>
        <div className="card p-6">
          <p className="text-[15px] font-medium">Tell someone where you are</p>
          {share ? (
            <>
              <p className="mt-2 rounded-xl bg-line/40 p-3 text-[13px] leading-relaxed text-ink-soft">{share}</p>
              <p className="mt-2 text-[12px] text-muted">Copy this and send it to a friend. One-tap sharing with a trusted contact is coming soon.</p>
            </>
          ) : (
            <p className="mt-2 text-[14px] leading-relaxed text-muted">Share your itinerary with a friend before you go. Trusted-contact sharing is coming soon.</p>
          )}
        </div>
      </div>

      <section className="card mt-6 p-6">
        <h2 className="display text-[28px]">Contact support</h2>
        <p className="mt-1 text-[14px] text-muted">{match ? `About: ${match.opportunity.title} with ${match.other.profile.firstName}.` : "Tell us what's going on."}</p>
        <ActionForm action={helpAction} className="mt-5 space-y-4" resetOnSuccess>
          {match && <input type="hidden" name="matchId" value={match.id} />}
          <div className="flex flex-wrap gap-2">
            <label className="chip has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper"><input type="radio" name="kind" value="support" defaultChecked className="sr-only" />A question or problem</label>
            <label className="chip has-[:checked]:border-oxblood has-[:checked]:bg-oxblood has-[:checked]:text-paper"><input type="radio" name="kind" value="emergency" className="sr-only" />An emergency affected my date</label>
          </div>
          <textarea name="details" rows={4} required maxLength={2000} className="field resize-none" placeholder="What happened? Only our team will read this." />
          <SubmitButton className="btn-dark w-full">Send to support</SubmitButton>
        </ActionForm>
      </section>
      <p className="mt-6 text-center text-[12px] text-muted">ONCE works to make dates safer but cannot guarantee anyone&apos;s safety.</p>
    </div>
  );
}
