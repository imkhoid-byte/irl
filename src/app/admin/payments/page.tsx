import { getDb } from "@/server/db/client";
import { listLedger, listPayments } from "@/server/services/admin";
import { requireAdmin } from "@/server/session";
import { adminRefundAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { StatusPill } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatRelative } from "@/lib/time";
import { H1, Table, Td } from "../ui";

export default async function Payments() {
  const admin = await requireAdmin();
  const db = getDb();
  const payments = listPayments(db, admin.id);
  const ledger = listLedger(db, admin.id);
  return (
    <div className="space-y-10">
      <H1 sub="Every status here was set by a verified provider webhook. All amounts are test data from the simulated provider.">Payments</H1>
      <Table head={["Member", "Amount (share + fee)", "Status", "Refunded", "Provider ref", "Created", "Refund"]}>
        {payments.map((p) => (
          <tr key={p.id}>
            <Td>{p.email}</Td>
            <Td>{formatMoney(p.amount_cents)} <span className="text-muted">({formatMoney(p.share_cents)} + {formatMoney(p.fee_cents)})</span> {p.is_test === 1 && <span className="text-[10px] text-amber-ink">TEST</span>}</Td>
            <Td><StatusPill status={p.status} />{p.failure_reason && <p className="mt-1 text-[11px] text-muted">{p.failure_reason}</p>}</Td>
            <Td>{p.refunded_cents ? formatMoney(p.refunded_cents) : "—"}</Td>
            <Td className="font-mono text-[11px] text-muted">{p.provider}:{p.provider_ref?.slice(0, 18)}</Td>
            <Td className="text-muted">{formatRelative(p.created_at)}</Td>
            <Td>
              {["captured", "partially_refunded"].includes(p.status) && (
                <ActionForm action={adminRefundAction} className="flex gap-1">
                  <input type="hidden" name="intentId" value={p.id} />
                  <input type="hidden" name="note" value="admin refund" />
                  <input name="amount" type="number" step="0.01" min="0.01" max={(p.amount_cents - p.refunded_cents) / 100} defaultValue={(p.amount_cents - p.refunded_cents) / 100} className="field w-24 px-2 py-1 text-[12px]" />
                  <SubmitButton className="btn-quiet text-[12px]">Refund</SubmitButton>
                </ActionForm>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      <div>
        <h2 className="display mb-3 text-[26px]">Ledger</h2>
        <p className="mb-3 text-[13px] text-muted">Append-only. Each row is tied to the provider event that proved it.</p>
        <Table head={["Kind", "Amount", "Payment", "Provider event", "When"]}>
          {ledger.map((l) => (
            <tr key={l.id}>
              <Td>{l.kind}</Td>
              <Td>{formatMoney(l.amount_cents)}</Td>
              <Td className="font-mono text-[11px] text-muted">{l.payment_intent_id.slice(0, 8)}</Td>
              <Td className="font-mono text-[11px] text-muted">{l.provider_event_id.slice(0, 28)}</Td>
              <Td className="text-muted">{formatRelative(l.created_at)}</Td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
