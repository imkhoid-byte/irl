import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DemoBadge, PageHeader } from "@/components/ui";
import { changePasswordAction, deleteAccountAction, emailPrefsAction, verifyIdentityAction } from "@/app/actions/profile";
import { unblockAction } from "@/app/actions/safety";
import { formatMoney } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { getOwnProfile } from "@/server/services/profiles";
import { listBlocked } from "@/server/services/safety";
import { paymentHistory } from "@/server/services/payments";
import { getCtx, requireMember } from "@/server/session";
import { StatusPill } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-8">
      <h2 className="display mb-4 text-[26px]">{title}</h2>
      {children}
    </section>
  );
}

export default async function Settings() {
  const user = await requireMember();
  const ctx = getCtx();
  const p = getOwnProfile(getDb(), user.id)!;
  const blocked = listBlocked(ctx, user.id);
  const payments = paymentHistory(ctx, user.id);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Settings" title="Account" />

      <Section title="Sign-in">
        <p className="text-[14px] text-muted">Signed in as <span className="text-ink">{user.email}</span></p>
        <ActionForm action={changePasswordAction} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><label className="label" htmlFor="current">Current password</label><input id="current" name="current" type="password" required className="field" autoComplete="current-password" /></div>
          <div><label className="label" htmlFor="next">New password</label><input id="next" name="next" type="password" required minLength={10} className="field" autoComplete="new-password" /></div>
          <SubmitButton className="btn-dark py-3">Change</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Identity verification">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-md text-[14px] leading-relaxed text-ink-soft">
            {p.verificationStatus === "verified"
              ? p.verificationIsTest ? "Verified with the simulated test provider. Your badge says “(test)” so nobody mistakes it for a real ID check." : "Your identity is verified."
              : "Optional. Verified members get a badge on their profile. In this demo the check is simulated and labelled as a test."}
          </p>
          {p.verificationStatus !== "verified" ? (
            <form action={verifyIdentityAction}><SubmitButton className="btn-ghost py-2.5 text-[14px]">Verify (test)</SubmitButton></form>
          ) : (
            <DemoBadge>{ctx.identity.isTest ? "Test verification" : "Verified"}</DemoBadge>
          )}
        </div>
      </Section>

      <Section title="Notifications">
        <form action={emailPrefsAction} className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-3 text-[14px]">
            <input type="checkbox" name="enabled" defaultChecked={p.emailNotifications} className="h-4 w-4 accent-oxblood" />
            Email me date updates and reminders
          </label>
          <SubmitButton className="btn-ghost py-2 text-[13px]">Save</SubmitButton>
        </form>
        <p className="mt-2 text-[12px] text-muted">In-app notifications are always on for anything about your dates. Demo emails go to an outbox, not a real inbox. Push notifications are coming soon.</p>
      </Section>

      <Section title="Payments">
        {payments.length === 0 ? (
          <p className="text-[14px] text-muted">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-line text-[14px]">
            {payments.map((pi) => (
              <li key={pi.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span>{pi.title} <span className="text-muted">· {formatMoney(pi.amount_cents)}{pi.refunded_cents > 0 && ` · ${formatMoney(pi.refunded_cents)} refunded`}</span></span>
                <span className="flex items-center gap-2"><StatusPill status={pi.status} />{pi.is_test === 1 && <span className="text-[11px] uppercase tracking-wider text-amber-ink">test</span>}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[12px] text-muted">ONCE never stores card numbers.</p>
      </Section>

      <Section title="Blocked">
        {blocked.length === 0 ? (
          <p className="text-[14px] text-muted">You haven&apos;t blocked anyone.</p>
        ) : (
          <ul className="divide-y divide-line">
            {blocked.map((b) => (
              <li key={b.blocked_id} className="flex items-center justify-between py-3 text-[14px]">
                {b.first_name}
                <form action={unblockAction}><input type="hidden" name="userId" value={b.blocked_id} /><button className="btn-quiet text-[13px]">Unblock</button></form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Delete account">
        <p className="text-[14px] leading-relaxed text-muted">Deletes your profile and photos and signs you out. Cancel any upcoming dates first, so nobody is left waiting. Payment records are kept as required for accounting.</p>
        <ActionForm action={deleteAccountAction} className="mt-4">
          <SubmitButton className="btn-ghost border-oxblood/40 py-2.5 text-[14px] text-oxblood">Delete my account</SubmitButton>
        </ActionForm>
      </Section>
    </div>
  );
}
