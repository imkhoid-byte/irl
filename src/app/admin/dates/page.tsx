import { getDb } from "@/server/db/client";
import { listMatchesAdmin } from "@/server/services/admin";
import { requireAdmin } from "@/server/session";
import { adminCancelMatchAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { StatusPill } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { H1, Table, Td } from "../ui";

export default async function Dates() {
  const admin = await requireAdmin();
  const rows = listMatchesAdmin(getDb(), admin.id);
  return (
    <div>
      <H1 sub="Every match and its reservation. Support cancellations refund both people in full.">Dates &amp; reservations</H1>
      <Table head={["Date", "People", "When", "Total", "Status", "Reservation", ""]}>
        {rows.map((m) => (
          <tr key={m.id}>
            <Td className="font-medium">{m.title} {m.is_test === 1 && <span className="text-[10px] text-amber-ink">TEST</span>}</Td>
            <Td>{m.names}</Td>
            <Td>{formatDateTime(m.starts_at)}</Td>
            <Td>{formatMoney(m.total_price_cents)}</Td>
            <Td><StatusPill status={m.status} /></Td>
            <Td>{m.reservation_status ?? "—"} {m.confirmation_code && <span className="font-mono text-[11px] text-muted">{m.confirmation_code}</span>}</Td>
            <Td>
              {(m.status === "confirmed" || m.status === "awaiting_commitment") && (
                <ActionForm action={adminCancelMatchAction}><input type="hidden" name="matchId" value={m.id} /><SubmitButton className="btn-quiet text-[12px]">Cancel (full refund)</SubmitButton></ActionForm>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
