import type { Metadata } from "next";
import { POLICY } from "@/lib/policy";
import { formatMoney } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { getLateRefundPct, getServiceFeeCents } from "@/server/services/settings";

export const metadata: Metadata = { title: "Pricing & policies" };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line py-12">
      <h2 className="display text-[36px]">{title}</h2>
      <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink-soft [&_strong]:font-medium [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export default function Policies() {
  const db = getDb();
  const fee = getServiceFeeCents(db);
  const latePct = getLateRefundPct(db);
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <p className="eyebrow mb-4">Pricing & policies</p>
      <h1 className="display text-[52px] sm:text-[68px]">Clear terms, before you commit.</h1>
      <p className="mt-5 text-[16px] leading-relaxed text-muted">
        These are the rules the app enforces. The numbers on this page are the live configuration of this demo.
      </p>

      <Section id="payments" title="How payment works">
        <p><strong>Both people pay their own half.</strong> The date total is split exactly 50/50. Neither person subsidises the other.</p>
        <p><strong>Service fee:</strong> {formatMoney(fee)} per person, shown separately before you commit. There is no subscription, and you never pay to see whether a date is available.</p>
        <p><strong>Holds, then payment.</strong> When you commit, we place an authorization hold for your half plus the fee. When both of you have committed and the venue booking is secured, both holds are captured and the date is confirmed. If the other person doesn&apos;t commit within the window (up to {POLICY.commitmentWindowHours} hours), or their payment fails, your hold is released and you are not charged.</p>
        <p><strong>No surprises.</strong> You see the exact amount, the time, the area and the cancellation deadline before paying. Nothing in ONCE creates a charge you didn&apos;t explicitly confirm.</p>
        <p><strong>Card details</strong> are handled by the payment provider and never stored by ONCE. Funds are processed by the provider; ONCE does not offer escrow.</p>
      </Section>

      <Section id="cancellations" title="Cancellations & refunds">
        <div className="card overflow-hidden">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-line/40 text-[12px] uppercase tracking-wider text-muted">
              <tr><th className="px-4 py-3 font-medium">When</th><th className="px-4 py-3 font-medium">You cancel</th><th className="px-4 py-3 font-medium">They cancel</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr><td className="px-4 py-3">Before both have committed</td><td className="px-4 py-3">No charge</td><td className="px-4 py-3">No charge</td></tr>
              <tr><td className="px-4 py-3">Confirmed, before the deadline</td><td className="px-4 py-3">Full refund incl. fee</td><td className="px-4 py-3">Full refund incl. fee</td></tr>
              <tr><td className="px-4 py-3">After the deadline</td><td className="px-4 py-3">{latePct}% of your half; fee kept</td><td className="px-4 py-3">Full refund incl. fee</td></tr>
              <tr><td className="px-4 py-3">Safety, blocking, venue or ONCE cancels</td><td className="px-4 py-3">Full refund</td><td className="px-4 py-3">Full refund</td></tr>
            </tbody>
          </table>
        </div>
        <p>The cancellation deadline is set per experience (usually 24 hours before; up to 48 hours for classes and dinners) and is shown on every date. Dates can&apos;t be cancelled once they&apos;ve started — use “Report an issue” instead.</p>
        <p><strong>Changing the time:</strong> either person can propose another available slot for the same experience. Nothing changes unless the other person explicitly agrees. A confirmed date is never silently altered.</p>
      </Section>

      <Section id="no-shows" title="No-shows & disputes">
        <p>After every date, each person privately confirms whether they attended and whether the other person did. If someone reports a no-show, it&apos;s treated as a claim — not a verdict.</p>
        <p>A member of our team reviews it. The other person is asked whether something came up and can report an emergency. Nothing affects anyone&apos;s standing unless the review upholds it. If upheld, the person who was stood up can be refunded their half.</p>
      </Section>

      <Section id="reliability" title="How reliability works">
        <p>Profiles can show a small reliability note based on <strong>verified attendance</strong>: a date counts when the other person confirms you were there. A no-show counts against you only after it&apos;s been reviewed and upheld.</p>
        <p>Nothing is shown until someone has at least {POLICY.reliabilityMinDates} counted dates (“New to ONCE”). We never display a score or shame anyone: a lower record simply reads as “Building history”.</p>
      </Section>

      <Section id="guidelines" title="Community guidelines">
        <ul className="list-disc space-y-2 pl-5">
          <li>You must be 18 or older, and you must be yourself — real name, real photos, honest intentions.</li>
          <li>Show up, or cancel in good time. Someone is setting aside an evening for you.</li>
          <li>Respect boundaries, on the date and after. No means no; a declined invitation is not an opening to negotiate.</li>
          <li>No harassment, hate, threats, or pressure of any kind. No soliciting, selling, or recruiting.</li>
          <li>Don&apos;t try to get around the no-messaging design to pressure people for contact details. Share them only if you both want to, in person.</li>
        </ul>
      </Section>

      <Section id="safety" title="Safety">
        <p>First dates are always at public venues. The venue name and address are shared only with the two of you, and only once the date is confirmed. Precise home locations are never collected — your profile shows a general neighbourhood only.</p>
        <p>Every date has a one-tap help button. If you are in immediate danger, call 911 (or your local emergency number) first. Tell a friend where you&apos;re going — sharing your itinerary with a trusted contact is coming soon.</p>
        <p>ONCE cannot guarantee anyone&apos;s safety and does not run background checks. Identity verification is optional and, in this demo, simulated: a “test” verification badge does not mean an identity was actually checked.</p>
      </Section>

      <Section id="privacy" title="Privacy, briefly">
        <p>Other members see your first name, age, general neighbourhood, approximate distance, bio, three interests, intention, preferred kinds of dates and your reliability note. They never see your email, birth date, exact location, dietary or accessibility notes, or payment details.</p>
        <p>Dietary and accessibility notes are optional and shared only with the venue for a confirmed booking.</p>
      </Section>

      <Section id="demo" title="What's simulated in this demo">
        <p>Venues, experiences and inventory are fictional sample data. Payments use a mock provider that simulates authorizations, declines, captures, refunds and signed webhooks — no real money moves. Venue bookings, identity verification and email delivery are simulated too. Every such record is labelled as test data.</p>
      </Section>
    </main>
  );
}
