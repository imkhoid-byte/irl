import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink } from "@/components/ui";
import { checkInAction } from "@/app/actions/dates";
import { requireMember } from "@/server/session";
import { loadMatch } from "../load";

export const metadata: Metadata = { title: "Post-date check-in" };

function YesNo({ name, question, hint }: { name: string; question: string; hint?: string }) {
  return (
    <fieldset className="border-t border-line py-5">
      <legend className="text-[16px]">{question}</legend>
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
      <div className="mt-3 flex gap-2">
        {["yes", "no"].map((v) => (
          <label key={v} className="chip has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper">
            <input type="radio" name={name} value={v} required className="sr-only" />
            {v === "yes" ? "Yes" : "No"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Rating({ name, question }: { name: string; question: string }) {
  return (
    <fieldset className="border-t border-line py-5">
      <legend className="text-[16px]">{question}</legend>
      <div className="mt-3 flex gap-2">
        {[1, 2, 3, 4, 5].map((v) => (
          <label key={v} className="chip w-11 justify-center has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper">
            <input type="radio" name={name} value={v} required className="sr-only" />
            {v}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default async function CheckIn({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  const m = loadMatch(user.id, id);
  if (m.status !== "completed" || m.feedback.submitted) redirect(`/matches/${id}`);
  const name = m.other.profile.firstName;
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href={`/matches/${id}`}>Back</BackLink>
      <p className="eyebrow mb-3">Private check-in</p>
      <h1 className="display text-[44px]">How did it go?</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        {m.opportunity.title} with {name}. Nothing you say here is shown to {name}. We only ever tell you both if you <em>both</em> want another date.
      </p>
      <ActionForm action={checkInAction} className="mt-8">
        <input type="hidden" name="matchId" value={m.id} />
        <YesNo name="attended" question="Did you attend?" />
        <YesNo name="otherAttended" question={`Did ${name} attend?`} hint="If not, we'll review it fairly before it affects anyone." />
        <YesNo name="feltSafe" question="Did you feel safe?" hint="If not, we'll take you straight to help and our team will follow up." />
        <YesNo name="openToAnother" question={`Would you be open to another date with ${name}?`} />
        <Rating name="experienceRating" question="How was the experience itself?" />
        <Rating name="venueRating" question="How was the venue?" />
        <div className="border-t border-line py-5">
          <label className="text-[16px]" htmlFor="comment">Anything else? <span className="text-muted">(optional, private)</span></label>
          <textarea id="comment" name="comment" rows={3} maxLength={1000} className="field mt-3 resize-none" placeholder="About the venue, the experience, or anything we should know." />
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Sending…">Submit check-in</SubmitButton>
      </ActionForm>
    </div>
  );
}
