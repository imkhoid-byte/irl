import { getDb } from "@/server/db/client";
import { listAudit } from "@/server/services/admin";
import { requireAdmin } from "@/server/session";
import { formatRelative } from "@/lib/time";
import { H1, Table, Td } from "../ui";

export default async function Audit() {
  const admin = await requireAdmin();
  const rows = listAudit(getDb(), admin.id);
  return (
    <div>
      <H1 sub="Who did what, when. Latest 300 events.">Audit log</H1>
      <Table head={["When", "Actor", "Action", "Entity", "Details"]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap text-muted">{formatRelative(r.created_at)}</Td>
            <Td>{r.actor}</Td>
            <Td className="font-mono text-[12px]">{r.action}</Td>
            <Td className="font-mono text-[11px] text-muted">{r.entity_type}:{r.entity_id?.slice(0, 8)}</Td>
            <Td className="max-w-xs truncate font-mono text-[11px] text-muted">{r.metadata === "{}" ? "" : r.metadata}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
