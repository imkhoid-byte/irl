import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, BackLink, PageHeader } from "@/components/ui";
import { blockAction, reportAction } from "@/app/actions/safety";
import { REPORT_KINDS } from "@/lib/catalog";
import { getDb } from "@/server/db/client";
import { getOwnProfile, haveConnection, toPublic } from "@/server/services/profiles";
import { requireMember } from "@/server/session";

export const metadata: Metadata = { title: "Report or block" };

export default async function Report({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ match?: string }> }) {
  const user = await requireMember();
  const { userId } = await params;
  const { match } = await searchParams;
  const db = getDb();
  // You can only report or block people you've actually been connected with.
  if (userId === user.id || !haveConnection(db, user.id, userId)) notFound();
  const p = getOwnProfile(db, userId);
  if (!p) notFound();
  const other = toPublic(p);
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href={match ? `/matches/${match}` : "/my-dates"}>Back</BackLink>
      <div className="mb-6 flex items-center gap-4">
        <Avatar profile={other} size={56} />
        <PageHeader title={`Report or block ${other.firstName}`} />
      </div>

      <section className="card p-6">
        <h2 className="text-[17px] font-medium">Report</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-muted">Reviewed privately by our team. {other.firstName} will never see who reported them or what you wrote.</p>
        <ActionForm action={reportAction} className="mt-5 space-y-4">
          <input type="hidden" name="reportedUserId" value={userId} />
          {match && <input type="hidden" name="matchId" value={match} />}
          <div className="space-y-2">
            {Object.entries(REPORT_KINDS).map(([k, label], i) => (
              <label key={k} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-4 py-3 text-[14px] has-[:checked]:border-ink">
                <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="accent-oxblood" />
                {label}
              </label>
            ))}
          </div>
          <textarea name="details" rows={4} maxLength={2000} className="field resize-none" placeholder="What happened? (optional)" />
          <label className="flex items-center gap-3 text-[14px]"><input type="checkbox" name="alsoBlock" className="h-4 w-4 accent-oxblood" /> Also block {other.firstName}</label>
          <SubmitButton className="btn-dark w-full">Send report</SubmitButton>
        </ActionForm>
      </section>

      <section className="card mt-5 p-6">
        <h2 className="text-[17px] font-medium">Block</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-muted">You won&apos;t see each other again. Pending invitations lapse, and any date you have together is cancelled with a full refund for both of you.</p>
        <ActionForm action={blockAction} className="mt-5">
          <input type="hidden" name="userId" value={userId} />
          <SubmitButton className="btn-ghost w-full border-oxblood/40 text-oxblood">Block {other.firstName}</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
