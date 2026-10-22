import type { Metadata } from "next";
import { FilterBar } from "@/components/filter-bar";
import { OpportunityCard } from "@/components/opportunity-card";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { CATEGORIES, CATEGORY_KEYS, INTENTIONS, INTENTION_KEYS, type Category, type Intention } from "@/lib/catalog";
import { formatDay } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { listOpportunities, type DiscoveryFilters } from "@/server/services/discovery";
import { requireMember } from "@/server/session";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Discover" };

type SP = Record<string, string | undefined>;

function parseFilters(sp: SP): DiscoveryFilters {
  const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  return {
    maxBudgetCents: num(sp.budget),
    when: (["week", "weekend", "evenings"].includes(sp.when ?? "") ? sp.when : "any") as DiscoveryFilters["when"],
    category: CATEGORY_KEYS.includes(sp.category as Category) ? (sp.category as Category) : "",
    maxDistanceKm: num(sp.distance),
    intention: INTENTION_KEYS.includes(sp.intention as Intention) ? (sp.intention as Intention) : "",
    maxDuration: num(sp.duration),
    setting: sp.setting === "indoor" || sp.setting === "outdoor" ? sp.setting : "any",
  };
}

export default async function Discover({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireMember();
  const sp = await searchParams;
  const opps = listOpportunities(getDb(), user.id, parseFilters(sp));
  const byDay = new Map<string, typeof opps>();
  for (const o of opps) {
    const d = formatDay(o.startsAt);
    byDay.set(d, [...(byDay.get(d) ?? []), o]);
  }

  return (
    <div>
      <PageHeader eyebrow={`Hi ${user.firstName ?? "there"}`} title={<>Dates worth <em>leaving home for.</em></>}>
        Pick a plan you&apos;d genuinely enjoy. When you find one, we&apos;ll suggest a few people who&apos;d like it too.
      </PageHeader>
      {sp.welcome && (
        <Notice tone="good" title="You're in." className="mb-6">
          Browse real plans below. Inviting someone is free — nobody pays anything until you&apos;ve both committed.
        </Notice>
      )}
      <Suspense>
        <FilterBar
          filters={[
            { key: "when", label: "Any time", options: [["week", "Next 7 days"], ["weekend", "This weekend & Fri night"], ["evenings", "Evenings"]] },
            { key: "category", label: "Any activity", options: CATEGORY_KEYS.map((c) => [c, CATEGORIES[c].label]) },
            { key: "budget", label: "Any budget", options: [["1500", "Up to $15 each"], ["3000", "Up to $30 each"], ["5000", "Up to $50 each"], ["7500", "Up to $75 each"]] },
            { key: "distance", label: "Any distance", options: [["3", "Within 3 km"], ["6", "Within 6 km"], ["10", "Within 10 km"]] },
            { key: "duration", label: "Any length", options: [["90", "Up to 90 min"], ["120", "Up to 2 hours"]] },
            { key: "setting", label: "Indoor & outdoor", options: [["indoor", "Indoor"], ["outdoor", "Outdoor"]] },
            { key: "intention", label: "Any intention", options: INTENTION_KEYS.map((k) => [k, INTENTIONS[k]]) },
          ]}
        />
      </Suspense>

      <div className="mt-8 space-y-12">
        {opps.length === 0 && (
          <EmptyState title="Nothing matches — yet.">
            Try widening your filters. New dates are added every week.
          </EmptyState>
        )}
        {[...byDay.entries()].map(([day, list]) => (
          <section key={day}>
            <h2 className="mb-4 flex items-baseline gap-3 border-b border-line pb-3">
              <span className="display text-[26px]">{day}</span>
              <span className="text-[12px] text-muted">{list.length} {list.length === 1 ? "date" : "dates"}</span>
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((o) => (
                <OpportunityCard key={o.slotId} o={o} openPeople={o.openPeople} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
