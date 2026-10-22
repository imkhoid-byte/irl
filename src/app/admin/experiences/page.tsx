import Link from "next/link";
import { getDb } from "@/server/db/client";
import { listExperiences, listVenues } from "@/server/services/admin";
import { requireAdmin } from "@/server/session";
import { createExperienceAction, toggleExperienceAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { CATEGORIES, CATEGORY_KEYS } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { H1, Table, Td } from "../ui";

export default async function Experiences() {
  const admin = await requireAdmin();
  const db = getDb();
  const exps = listExperiences(db, admin.id);
  return (
    <div className="space-y-8">
      <H1 sub="Date templates and their inventory. Totals must split evenly — each person pays exactly half.">Experiences</H1>
      <Table head={["Experience", "Category", "Venue", "Total / each", "Length", "Open slots", "Held/booked", ""]}>
        {exps.map((e) => (
          <tr key={e.id}>
            <Td className="font-medium"><Link href={`/admin/experiences/${e.id}`} className="underline-offset-4 hover:underline">{e.title}</Link>{!e.active && <span className="ml-2 text-[11px] text-muted">(inactive)</span>}</Td>
            <Td>{CATEGORIES[e.category as keyof typeof CATEGORIES]?.short}</Td>
            <Td>{e.venue}</Td>
            <Td>{formatMoney(e.total_price_cents)} / {formatMoney(e.total_price_cents / 2)}</Td>
            <Td>{e.duration_minutes} min</Td>
            <Td>{e.open_slots}</Td>
            <Td>{e.reserved}</Td>
            <Td><form action={toggleExperienceAction}><input type="hidden" name="experienceId" value={e.id} /><button className="btn-quiet text-[12px]">{e.active ? "Deactivate" : "Activate"}</button></form></Td>
          </tr>
        ))}
      </Table>
      <div className="card p-6">
        <h2 className="display mb-4 text-[26px]">New experience</h2>
        <ActionForm action={createExperienceAction} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
          <input name="title" placeholder="Title" required className="field" />
          <select name="category" className="field">{CATEGORY_KEYS.map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}</select>
          <select name="venueId" className="field">{listVenues(db, admin.id).filter((v) => v.active).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          <input name="atmosphere" placeholder="Atmosphere (one line)" required className="field" />
          <textarea name="description" placeholder="Description" required rows={3} className="field sm:col-span-2" />
          <textarea name="includes" placeholder="What's included (one per line)" rows={3} className="field sm:col-span-2" />
          <label className="text-[13px]">Total price ($)<input name="totalPriceDollars" type="number" step="0.02" min="1" required className="field mt-1" /></label>
          <label className="text-[13px]">Duration (minutes)<input name="durationMinutes" type="number" min="30" defaultValue={90} required className="field mt-1" /></label>
          <label className="text-[13px]">Free cancellation (hours before)<input name="cancellationHours" type="number" min="1" defaultValue={24} required className="field mt-1" /></label>
          <label className="flex items-center gap-2 self-end pb-3 text-[14px]"><input type="checkbox" name="indoor" defaultChecked className="accent-oxblood" /> Indoor</label>
          <input name="dressCode" placeholder="Dress code" className="field" />
          <input name="arrivalNotes" placeholder="Arrival instructions" className="field" />
          <SubmitButton className="btn-dark sm:col-span-2">Create experience</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
