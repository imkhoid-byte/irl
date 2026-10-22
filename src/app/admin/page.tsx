import { getDb } from "@/server/db/client";
import { analytics } from "@/server/services/admin";
import { requireAdmin } from "@/server/session";
import { H1 } from "./ui";

function Stat({ label, value, unit = "%", note }: { label: string; value: number | null; unit?: string; note: string }) {
  return (
    <div className="card p-5">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="display mt-2 text-[40px] tabular-nums">{value === null ? "—" : `${unit === "★" ? value.toFixed(1) : value}${unit === "★" ? "" : unit}`}{unit === "★" && value !== null && <span className="ml-1 font-sans text-[14px] text-muted">/ 5</span>}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">{note}</p>
    </div>
  );
}

export default async function AdminHome() {
  const admin = await requireAdmin();
  const a = analytics(getDb(), admin.id);
  return (
    <div>
      <H1 sub="Outcome metrics only — whether real dates happen. Aggregated; no individual behaviour tracking. Demo data includes seeded history.">Outcomes</H1>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Active members", a.totals.users], ["Upcoming confirmed dates", a.totals.confirmedUpcoming], ["Completed dates", a.totals.completed], ["Open reports", a.totals.openReports]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-line px-4 py-3"><p className="text-[12px] text-muted">{l}</p><p className="mt-1 text-[22px] font-medium tabular-nums">{v}</p></div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Invitations accepted" value={a.invitationAcceptance} note="Of invitations that got an answer or lapsed." />
        <Stat label="Accepted → confirmed" value={a.acceptedToConfirmed} note="Matches where both committed and the venue was secured." />
        <Stat label="Payment completion" value={a.paymentCompletion} note="Payment attempts that authorized successfully." />
        <Stat label="Attendance" value={a.attendance} note="Check-ins where the other person confirmed attendance." />
        <Stat label="Cancellation rate" value={a.cancellationRate} note="Confirmed dates later cancelled." />
        <Stat label="No-show rate" value={a.noShowRate} note="Upheld no-shows per attendance check-in." />
        <Stat label="Mutual interest" value={a.mutualInterest} note="Dates where both said yes to another." />
        <Stat label="Refund rate" value={a.refundRate} note="Captured payments later (partly) refunded." />
        <Stat label="Dispute rate" value={a.disputeRate} note="No-show disputes per completed date." />
        <Stat label="Time to first date" value={a.hoursToFirstDate} unit=" h" note="Average hours from signup to first confirmed date." />
        <Stat label="Experience satisfaction" value={a.experienceSatisfaction} unit="★" note="Average post-date rating of the experience." />
        <Stat label="Venue satisfaction" value={a.venueSatisfaction} unit="★" note="Rated separately from romantic compatibility." />
      </div>
    </div>
  );
}
