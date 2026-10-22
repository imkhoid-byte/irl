import { getDb } from "@/server/db/client";
import { getLateRefundPct, getServiceFeeCents } from "@/server/services/settings";
import { requireAdmin } from "@/server/session";
import { updateSettingsAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { H1 } from "../ui";

export default async function Settings() {
  await requireAdmin();
  const db = getDb();
  return (
    <div className="max-w-xl">
      <H1 sub="Changes apply to new matches only. Existing dates keep the exact terms both people agreed to.">Fees &amp; policy</H1>
      <ActionForm action={updateSettingsAction} className="card space-y-4 p-6">
        <label className="block text-[14px]">Service fee per person ($)<input name="fee" type="number" step="0.01" min="0" max="50" defaultValue={getServiceFeeCents(db) / 100} className="field mt-1" /></label>
        <label className="block text-[14px]">Late cancellation: % of their half refunded to the canceller<input name="latePct" type="number" min="0" max="100" defaultValue={getLateRefundPct(db)} className="field mt-1" /></label>
        <SubmitButton className="btn-dark">Save</SubmitButton>
      </ActionForm>
    </div>
  );
}
