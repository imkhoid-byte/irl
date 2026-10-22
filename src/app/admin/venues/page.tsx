import { getDb } from "@/server/db/client";
import { listVenues } from "@/server/services/admin";
import { listNeighborhoods } from "@/server/services/profiles";
import { requireAdmin } from "@/server/session";
import { createVenueAction, toggleVenueAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { H1, Table, Td } from "../ui";

export default async function Venues() {
  const admin = await requireAdmin();
  const db = getDb();
  const venues = listVenues(db, admin.id);
  return (
    <div className="space-y-8">
      <H1 sub="All venues in demo mode are fictional. Real venue partners and booking integrations are a Phase 2 item.">Venues</H1>
      <Table head={["Venue", "Type", "Area", "Address", "Status", ""]}>
        {venues.map((v) => (
          <tr key={v.id}>
            <Td className="font-medium">{v.name} {v.is_demo === 1 && <span className="text-[10px] text-amber-ink">DEMO</span>}</Td>
            <Td>{v.venue_type}</Td>
            <Td>{v.neighborhood}</Td>
            <Td className="text-muted">{v.address}</Td>
            <Td>{v.active ? "Active" : "Inactive"}</Td>
            <Td><form action={toggleVenueAction}><input type="hidden" name="venueId" value={v.id} /><button className="btn-quiet text-[12px]">{v.active ? "Deactivate" : "Activate"}</button></form></Td>
          </tr>
        ))}
      </Table>
      <div className="card p-6">
        <h2 className="display mb-4 text-[26px]">Add a venue</h2>
        <ActionForm action={createVenueAction} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
          <input name="name" placeholder="Name" required className="field" />
          <input name="venueType" placeholder="Type (e.g. Wine bar)" required className="field" />
          <select name="neighborhoodId" required className="field">{listNeighborhoods(db).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
          <input name="address" placeholder="Address" required className="field" />
          <input name="accessibilityNotes" placeholder="Accessibility notes" className="field" />
          <input name="dietaryOptions" placeholder="Dietary options" className="field" />
          <SubmitButton className="btn-dark sm:col-span-2">Add venue</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
