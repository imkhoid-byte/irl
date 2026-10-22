import { getDb } from "@/server/db/client";
import { listOutbox } from "@/server/services/admin";
import { requireAdmin } from "@/server/session";
import { formatRelative } from "@/lib/time";
import { H1 } from "../ui";

export default async function Outbox() {
  const admin = await requireAdmin();
  const mails = listOutbox(getDb(), admin.id);
  return (
    <div>
      <H1 sub="Demo email provider: messages are recorded here instead of being sent.">Email outbox</H1>
      <div className="card divide-y divide-line">
        {mails.length === 0 && <p className="p-5 text-[14px] text-muted">Empty.</p>}
        {mails.map((m) => (
          <div key={m.id} className="px-5 py-3 text-[14px]">
            <p><span className="text-muted">To {m.email} · {formatRelative(m.created_at)}</span></p>
            <p className="font-medium">{m.subject}</p>
            <p className="text-ink-soft">{m.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
