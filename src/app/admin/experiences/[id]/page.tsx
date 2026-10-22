import { notFound } from "next/navigation";
import { getDb } from "@/server/db/client";
import { listSlots } from "@/server/services/admin";
import { one } from "@/server/db";
import { requireAdmin } from "@/server/session";
import { addSlotAction, setSlotStatusAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BackLink } from "@/components/ui";
import { formatDateTime } from "@/lib/time";
import { H1, Table, Td } from "../../ui";

export default async function ExperienceSlots({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const db = getDb();
  const exp = one<{ title: string }>(db, "SELECT title FROM date_experiences WHERE id = ?", id);
  if (!exp) notFound();
  const slots = listSlots(db, admin.id, id);
  return (
    <div className="space-y-8">
      <BackLink href="/admin/experiences">Experiences</BackLink>
      <H1 sub="Capacity is the number of two-person dates a slot can hold. Holds and bookings can never exceed it.">{exp.title}</H1>
      <Table head={["Starts", "Capacity", "Held/booked", "Status", ""]}>
        {slots.map((s) => (
          <tr key={s.id}>
            <Td>{formatDateTime(s.starts_at)}</Td>
            <Td>{s.capacity}</Td>
            <Td>{s.reserved_count}</Td>
            <Td>{s.status}</Td>
            <Td>
              <form action={setSlotStatusAction}>
                <input type="hidden" name="slotId" value={s.id} /><input type="hidden" name="experienceId" value={id} />
                <input type="hidden" name="status" value={s.status === "open" ? "closed" : "open"} />
                <button className="btn-quiet text-[12px]">{s.status === "open" ? "Close" : "Reopen"}</button>
              </form>
            </Td>
          </tr>
        ))}
      </Table>
      <div className="card p-6">
        <h2 className="display mb-4 text-[26px]">Add a slot</h2>
        <ActionForm action={addSlotAction} className="grid gap-3 sm:grid-cols-4" resetOnSuccess>
          <input type="hidden" name="experienceId" value={id} />
          <label className="text-[13px]">Date<input type="date" name="date" required className="field mt-1" /></label>
          <label className="text-[13px]">Time (New York)<input type="time" name="time" required className="field mt-1" /></label>
          <label className="text-[13px]">Capacity<input type="number" name="capacity" min="1" max="20" defaultValue={2} className="field mt-1" /></label>
          <SubmitButton className="btn-dark self-end">Add slot</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
