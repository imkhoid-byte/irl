import { getDb } from "@/server/db/client";
import { listReports } from "@/server/services/admin";
import { requireAdmin } from "@/server/session";
import { resolveReportAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { StatusPill } from "@/components/ui";
import { formatRelative } from "@/lib/time";
import { H1 } from "../ui";

const LABEL: Record<string, string> = { no_show: "No-show dispute", safety: "Safety", emergency: "Emergency", support: "Support request", harassment: "Harassment", misconduct: "Misconduct", fake_profile: "Fake profile", other: "Other" };

export default async function Reports() {
  const admin = await requireAdmin();
  const reports = listReports(getDb(), admin.id);
  return (
    <div>
      <H1 sub="Reports are never shown to the reported person. A no-show only affects reliability once upheld here.">Reports &amp; disputes</H1>
      <div className="space-y-3">
        {reports.length === 0 && <p className="text-[14px] text-muted">No reports.</p>}
        {reports.map((r) => (
          <div key={r.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[15px] font-medium">{LABEL[r.kind] ?? r.kind} <span className="font-normal text-muted">· from {r.reporter}{r.reported && ` about ${r.reported}`} · {formatRelative(r.created_at)}</span></p>
              <StatusPill status={r.status === "open" ? "pending" : r.status === "upheld" ? "confirmed" : r.status === "reviewing" ? "awaiting_commitment" : "completed"} className="capitalize" />
            </div>
            {r.details && <p className="mt-2 text-[14px] text-ink-soft">{r.details}</p>}
            {r.resolution_note && <p className="mt-2 text-[13px] text-muted">Resolution: {r.resolution_note} ({r.status})</p>}
            {(r.status === "open" || r.status === "reviewing") && (
              <ActionForm action={resolveReportAction} className="mt-4 space-y-3">
                <input type="hidden" name="reportId" value={r.id} />
                <input name="note" placeholder="Resolution note (internal)" className="field py-2 text-[13px]" />
                {r.kind === "no_show" && r.match_id && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="refund" className="accent-oxblood" /> If upheld, refund the reporter&apos;s share</label>}
                <div className="flex flex-wrap gap-2">
                  <SubmitButton className="btn-dark px-4 py-2 text-[13px]" name="decision" value="upheld">Uphold</SubmitButton>
                  <SubmitButton className="btn-ghost px-4 py-2 text-[13px]" name="decision" value="dismissed">Dismiss</SubmitButton>
                  <SubmitButton className="btn-ghost px-4 py-2 text-[13px]" name="decision" value="resolved">Resolved</SubmitButton>
                  {r.status === "open" && <SubmitButton className="btn-quiet px-2 text-[13px]" name="decision" value="reviewing">Mark reviewing</SubmitButton>}
                </div>
              </ActionForm>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
