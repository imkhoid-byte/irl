import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink, Notice } from "@/components/ui";
import { cancelMatchAction } from "@/app/actions/dates";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { cancellationPreview } from "@/server/services/lifecycle";
import { AppError } from "@/server/errors";
import { getCtx, requireMember } from "@/server/session";
import { loadMatch } from "../load";

export const metadata: Metadata = { title: "Cancel date" };

export default async function Cancel({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  const m = loadMatch(user.id, id);
  if (m.status !== "confirmed" && m.status !== "awaiting_commitment") redirect(`/matches/${id}`);
  let preview;
  try {
    preview = cancellationPreview(getCtx(), user.id, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const started = new Date(m.opportunity.startsAt) <= new Date();

  return (
    <div className="mx-auto max-w-xl">
      <BackLink href={`/matches/${id}`}>Back to your date</BackLink>
      <h1 className="display text-[44px]">{m.status === "confirmed" ? "Cancel this date?" : "Withdraw from this date?"}</h1>
      <p className="mt-3 text-[15px] text-muted">{m.opportunity.title} with {m.other.profile.firstName} · {formatDateTime(m.opportunity.startsAt)}</p>

      <div className="card mt-8 p-6">
        {preview.stage === "unconfirmed" ? (
          <p className="text-[15px] leading-relaxed">{preview.summary}</p>
        ) : (
          <dl className="space-y-4 text-[15px]">
            <div>
              <dt className="text-muted">You&apos;ll get back</dt>
              <dd className="display mt-1 text-[36px]">{formatMoney(preview.mine.refundCents)}</dd>
              <dd className="text-[13px] text-muted">{preview.mine.summary}</dd>
            </div>
            <div className="rule" />
            <div>
              <dt className="text-muted">{m.other.profile.firstName} gets back</dt>
              <dd className="mt-1">{formatMoney(preview.other.refundCents)} — {preview.other.summary.toLowerCase()}</dd>
            </div>
            {!preview.beforeDeadline && <Notice tone="warn">The free-cancellation deadline ({formatDateTime(m.cancellationDeadline)}) has passed.</Notice>}
          </dl>
        )}
      </div>

      {started ? (
        <Notice tone="warn" className="mt-6">This date has already started, so it can&apos;t be cancelled. If something went wrong, use Help &amp; safety.</Notice>
      ) : (
        <ActionForm action={cancelMatchAction} className="mt-6 space-y-4">
          <input type="hidden" name="matchId" value={m.id} />
          <div>
            <label className="label" htmlFor="reason">Reason (private, optional)</label>
            <select id="reason" name="reason" className="field">
              <option value="participant">Prefer not to say</option>
              <option value="schedule_conflict">Something came up</option>
              <option value="unwell">I&apos;m unwell</option>
              <option value="changed_mind">Changed my mind</option>
            </select>
            <p className="mt-1.5 text-[12px] text-muted">If you feel unsafe, use Report or block instead — it cancels with a full refund for both.</p>
          </div>
          <SubmitButton className="btn-dark w-full" pendingText="Cancelling…">{m.status === "confirmed" ? "Cancel date" : "Withdraw"}</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
