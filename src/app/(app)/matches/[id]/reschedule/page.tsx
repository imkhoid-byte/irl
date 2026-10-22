import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, EmptyState } from "@/components/ui";
import { requestRescheduleAction } from "@/app/actions/dates";
import { formatDateTime } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { alternativeSlots } from "@/server/services/dates";
import { requireMember } from "@/server/session";
import { loadMatch } from "../load";

export const metadata: Metadata = { title: "Propose a new time" };

export default async function Reschedule({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  const m = loadMatch(user.id, id);
  if (m.status !== "confirmed" || m.reschedule) redirect(`/matches/${id}`);
  const slots = alternativeSlots(getDb(), user.id, id);
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href={`/matches/${id}`}>Back to your date</BackLink>
      <h1 className="display text-[44px]">Propose a different time.</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Same experience, same price. {m.other.profile.firstName} will be asked to agree — until they do, your date stays at {formatDateTime(m.opportunity.startsAt)}.
      </p>
      {slots.length === 0 ? (
        <div className="mt-8"><EmptyState title="No other times available.">There aren&apos;t any open slots that work for both of you right now.</EmptyState></div>
      ) : (
        <ActionForm action={requestRescheduleAction} className="mt-8 space-y-4">
          <input type="hidden" name="matchId" value={m.id} />
          <div className="space-y-2">
            {slots.map((s, i) => (
              <label key={s.slotId} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-strong bg-paper px-4 py-3 text-[15px] has-[:checked]:border-ink">
                <input type="radio" name="slotId" value={s.slotId} defaultChecked={i === 0} className="accent-oxblood" />
                {formatDateTime(s.startsAt)}
              </label>
            ))}
          </div>
          <SubmitButton className="btn-dark w-full">Send request</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
