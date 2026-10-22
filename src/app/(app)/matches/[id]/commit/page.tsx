import type { Metadata } from "next";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { ActionForm, Countdown, SubmitButton } from "@/components/forms";
import { BackLink, DemoBadge, Notice, PriceTable } from "@/components/ui";
import { confirmDetailsAction, payAction } from "@/app/actions/dates";
import { formatDateTime, formatDuration } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { TEST_PAYMENT_METHODS } from "@/server/providers/payments/types";
import { getCtx, requireMember } from "@/server/session";
import { loadMatch } from "../load";

export const metadata: Metadata = { title: "Commit to your date" };

export default async function Commit({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  const m = loadMatch(user.id, id);
  if (m.status !== "awaiting_commitment" || m.me.committed) redirect(`/matches/${id}`);
  const o = m.opportunity;
  const isTest = getCtx().payments.isTest;
  const lateWindow = new Date(m.cancellationDeadline) <= new Date();

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href={`/matches/${id}`}>Back to your date</BackLink>
      <p className="eyebrow mb-3">Step {m.me.detailsConfirmed ? "2" : "1"} of 2</p>
      <h1 className="display text-[44px] sm:text-[54px]">{m.me.detailsConfirmed ? "Commit your half." : "Confirm the exact plan."}</h1>
      <p className="mt-3 text-[15px] text-muted">
        Window closes in <Countdown to={m.commitmentExpiresAt} className="font-medium text-ink" />. If either of you doesn&apos;t commit by then, nothing is charged.
      </p>

      <div className="card mt-8 divide-y divide-line">
        <dl className="grid gap-4 p-6 text-[14px] sm:grid-cols-2">
          <div><dt className="text-muted">Experience</dt><dd className="mt-0.5 font-medium">{o.title}</dd></div>
          <div><dt className="text-muted">With</dt><dd className="mt-0.5 font-medium">{m.other.profile.firstName}, {m.other.profile.age}</dd></div>
          <div><dt className="text-muted">When</dt><dd className="mt-0.5">{formatDateTime(o.startsAt)}</dd></div>
          <div><dt className="text-muted">Length</dt><dd className="mt-0.5">{formatDuration(o.durationMinutes)}</dd></div>
          <div><dt className="text-muted">Where</dt><dd className="mt-0.5">{o.venueType}, {o.neighborhood}</dd></div>
          <div><dt className="text-muted">Free cancellation until</dt><dd className="mt-0.5">{formatDateTime(m.cancellationDeadline)}</dd></div>
        </dl>
        <div className="p-6">
          <PriceTable totalCents={m.price.totalCents} shareCents={m.price.shareCents} feeCents={m.price.feeCents} isTest={isTest} />
        </div>
        <div className="p-6 text-[13px] leading-relaxed text-ink-soft">
          <p className="font-medium text-ink">Cancellation terms</p>
          <p className="mt-1">Before the deadline: full refund for both of you. After it: the person who cancels gets back part of their half (see <a href="/policies#cancellations" target="_blank" className="underline">policy</a>) and the other person is refunded in full. Safety, venue and support cancellations are always refunded in full.</p>
          {lateWindow && <Notice tone="warn" className="mt-3">This date is already inside its cancellation window. Once confirmed, late-cancellation terms apply straight away.</Notice>}
        </div>
      </div>

      {!m.me.detailsConfirmed ? (
        <ActionForm action={confirmDetailsAction} className="mt-6">
          <input type="hidden" name="matchId" value={m.id} />
          <input type="hidden" name="termsHash" value={m.termsHash} />
          <label className="flex items-start gap-3 rounded-2xl border border-line-strong bg-paper p-4 text-[14px] leading-relaxed">
            <input type="checkbox" name="agree" className="mt-1 h-4 w-4 accent-oxblood" required />
            <span>I agree to this exact date, time, experience and price, and to the cancellation terms above.</span>
          </label>
          <SubmitButton className="btn-primary mt-5 w-full" pendingText="Confirming…">Confirm details</SubmitButton>
        </ActionForm>
      ) : (
        <ActionForm action={payAction} className="mt-6">
          <input type="hidden" name="matchId" value={m.id} />
          <input type="hidden" name="idempotencyKey" value={`commit:${m.id}:${crypto.randomUUID()}`} />
          <fieldset>
            <legend className="mb-3 flex w-full items-center justify-between">
              <span className="text-[15px] font-medium">Payment method</span>
              {isTest && <DemoBadge>Test mode · no real charge</DemoBadge>}
            </legend>
            <div className="space-y-2">
              {Object.entries(TEST_PAYMENT_METHODS).map(([pm, info], i) => (
                <label key={pm} className="flex cursor-pointer items-center justify-between rounded-xl border border-line-strong bg-paper px-4 py-3 text-[14px] has-[:checked]:border-ink">
                  <span className="flex items-center gap-3">
                    <input type="radio" name="paymentMethod" value={pm} defaultChecked={i === 0} className="accent-oxblood" />
                    {info.label}
                  </span>
                  <span className="text-[12px] text-muted">Test card · {info.outcome.toLowerCase()}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              In production, your card is entered in the payment provider&apos;s secure field and never touches ONCE&apos;s servers. In this demo, choose a simulated test card.
            </p>
          </fieldset>
          <SubmitButton className="btn-primary mt-5 w-full" pendingText="Placing hold…">Commit {formatMoney(m.price.dueCents)}</SubmitButton>
          <p className="mt-3 text-center text-[12px] text-muted">This places a hold. You&apos;re only charged once {m.other.profile.firstName} commits too and the venue is secured.</p>
        </ActionForm>
      )}
    </div>
  );
}
