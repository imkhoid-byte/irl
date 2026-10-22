import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExperienceArt } from "@/components/experience-art";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink } from "@/components/ui";
import { inviteAction } from "@/app/actions/dates";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { busyAt, listOpportunities } from "@/server/services/discovery";
import { requireMember } from "@/server/session";
import { loadMatch } from "../load";

export const metadata: Metadata = { title: "See each other again" };

export default async function Again({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  const m = loadMatch(user.id, id);
  if (!m.feedback.mutualYes || m.repeatInvitation) redirect(`/matches/${id}`);
  const db = getDb();
  const other = m.other.profile;
  // One option per experience, at times when neither of you is busy.
  const seen = new Set<string>();
  const options = listOpportunities(db, user.id)
    .filter((o) => !busyAt(db, other.userId, o.startsAt) && !busyAt(db, user.id, o.startsAt))
    .filter((o) => (seen.has(o.experienceId) ? false : (seen.add(o.experienceId), true)))
    .slice(0, 9);

  return (
    <div>
      <BackLink href={`/matches/${id}`}>Back</BackLink>
      <p className="eyebrow mb-3">You both said yes</p>
      <h1 className="display text-[44px] sm:text-[56px]">Where to next, with {other.firstName}?</h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">Pick a plan. {other.firstName} gets an invitation, and you both commit your half again — still no chat, still no numbers.</p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => (
          <div key={o.slotId} className="card overflow-hidden">
            <ExperienceArt category={o.category} className="aspect-[16/9]" />
            <div className="p-5">
              <p className="display text-[24px]">{o.title}</p>
              <p className="mt-1 text-[13px] text-muted">{formatDateTime(o.startsAt)}</p>
              <p className="mt-2 text-[14px]">{formatMoney(o.price.shareCents)} each</p>
              <ActionForm action={inviteAction} className="mt-4">
                <input type="hidden" name="slotId" value={o.slotId} />
                <input type="hidden" name="toUserId" value={other.userId} />
                <input type="hidden" name="repeatOf" value={m.id} />
                <SubmitButton className="btn-dark w-full py-2.5 text-[14px]">Invite {other.firstName}</SubmitButton>
              </ActionForm>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
