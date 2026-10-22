import { getDb } from "@/server/db/client";
import { listUsers } from "@/server/services/admin";
import { requireAdmin } from "@/server/session";
import { setUserStatusAction } from "@/app/actions/admin";
import { StatusPill } from "@/components/ui";
import { H1, Table, Td } from "../ui";

export default async function Users() {
  const admin = await requireAdmin();
  const users = listUsers(getDb(), admin.id);
  return (
    <div>
      <H1 sub="Suspending signs a member out and cancels their pending invitations.">Users</H1>
      <Table head={["Member", "Email", "Status", "Verification", "Reports", ""]}>
        {users.map((u) => (
          <tr key={u.id}>
            <Td>{u.first_name ?? "—"}{u.age !== null && `, ${u.age}`} {u.is_admin === 1 && <span className="ml-1 rounded bg-ink px-1.5 text-[10px] text-paper">ADMIN</span>} {u.is_demo === 1 && <span className="text-[10px] text-amber-ink">DEMO</span>}</Td>
            <Td className="text-muted">{u.email}</Td>
            <Td><StatusPill status={u.status === "active" ? "confirmed" : "cancelled"} className="!px-2" /> <span className="text-[12px] text-muted">{u.status}</span></Td>
            <Td>{u.verification_status ?? "—"}</Td>
            <Td>{u.reports}</Td>
            <Td>
              {u.id !== admin.id && u.status !== "deleted" && (
                <form action={setUserStatusAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="status" value={u.status === "active" ? "suspended" : "active"} />
                  <button className="btn-quiet text-[12px]">{u.status === "active" ? "Suspend" : "Reinstate"}</button>
                </form>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
