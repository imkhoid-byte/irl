import Link from "next/link";
import { ExperienceArt } from "./experience-art";
import { DemoBadge } from "./ui";
import { CATEGORIES } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { formatDuration, formatShortDay, formatTime } from "@/lib/time";
import type { Opportunity } from "@/server/services/discovery";

export function OpportunityCard({ o, openPeople }: { o: Opportunity; openPeople?: number }) {
  return (
    <Link href={`/dates/${o.slotId}`} className="group card flex flex-col overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_24px_48px_-28px_rgba(26,23,21,0.35)]">
      <div className="relative">
        <ExperienceArt category={o.category} className="aspect-[16/10]" label={o.title} />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <span className="rounded-full bg-paper/90 px-2.5 py-1 text-[11px] font-medium text-ink backdrop-blur">{CATEGORIES[o.category].short}</span>
          {o.isDemo && <DemoBadge className="bg-amber/90 backdrop-blur">Demo</DemoBadge>}
        </div>
        {o.datesLeft === 1 && <span className="absolute right-3 top-3 rounded-full bg-oxblood px-2.5 py-1 text-[11px] font-medium text-paper">Last table</span>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="eyebrow">
          {formatShortDay(o.startsAt)} · {formatTime(o.startsAt)} · {formatDuration(o.durationMinutes)}
        </p>
        <h3 className="display mt-2.5 text-[28px] group-hover:text-oxblood">{o.title}</h3>
        <p className="mt-1.5 text-[13px] text-muted">
          {o.venueType} · {o.neighborhood}
          {o.distanceKm !== null && ` · ${o.distanceKm} km`}
        </p>
        <p className="mt-3 line-clamp-2 text-[14px] leading-relaxed text-ink-soft">{o.atmosphere}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <p className="text-[14px]">
            <span className="text-muted">{formatMoney(o.price.totalCents)} total · </span>
            <span className="font-medium">{formatMoney(o.price.shareCents)} each</span>
          </p>
          {openPeople !== undefined && openPeople > 0 && (
            <p className="text-right text-[12px] text-muted">{openPeople} {openPeople === 1 ? "person" : "people"} open to this</p>
          )}
        </div>
      </div>
    </Link>
  );
}
