import { getDb } from "@/server/db/client";
import { getMatchView } from "@/server/services/dates";
import { currentUser } from "@/server/session";

const ics = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/** Calendar export for a confirmed date — participants only. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const { id } = await params;
  let m;
  try {
    m = getMatchView(getDb(), user.id, id);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!m.venue || (m.status !== "confirmed" && m.status !== "completed")) return new Response("Not found", { status: 404 });
  const start = new Date(m.opportunity.startsAt);
  const end = new Date(start.getTime() + m.opportunity.durationMinutes * 60_000);
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ONCE//Dates//EN", "BEGIN:VEVENT",
    `UID:${m.id}@once.date`, `DTSTAMP:${ics(new Date())}`, `DTSTART:${ics(start)}`, `DTEND:${ics(end)}`,
    `SUMMARY:${esc(`${m.opportunity.title} with ${m.other.profile.firstName}`)}`,
    `LOCATION:${esc(`${m.venue.name}, ${m.venue.address}`)}`,
    `DESCRIPTION:${esc(`Reservation ${m.reservation?.confirmationCode ?? ""}. ${m.venue.arrival_notes}`)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="once-date.ics"` } });
}
