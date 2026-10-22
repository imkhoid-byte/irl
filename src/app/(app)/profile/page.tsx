import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, ProfileCard } from "@/components/ui";
import { CATEGORIES, INTENTIONS } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { getOwnProfile, toPublic } from "@/server/services/profiles";
import { requireMember } from "@/server/session";
import { logoutAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Profile" };

export default async function Profile() {
  const user = await requireMember();
  const p = getOwnProfile(getDb(), user.id);
  if (!p) redirect("/onboarding");
  return (
    <div>
      <PageHeader eyebrow="Profile" title={<>This is how you <em>appear.</em></>}>
        Other members see only what&apos;s on this card — plus your first name on dates you share.
      </PageHeader>
      <ProfileCard profile={toPublic(p)} footer={<Link href="/profile/edit" className="btn-dark py-2.5 text-[14px]">Edit profile</Link>} />
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <div className="card p-6">
          <p className="eyebrow mb-4">Your preferences (private)</p>
          <dl className="space-y-3 text-[14px]">
            <div><dt className="text-muted">Looking for</dt><dd>{INTENTIONS[p.intention]}</dd></div>
            <div><dt className="text-muted">Dates you&apos;d enjoy</dt><dd>{p.preferredCategories.map((c) => CATEGORIES[c].label).join(", ")}</dd></div>
            <div><dt className="text-muted">When</dt><dd>{p.preferredDays.join(", ")} · {p.preferredTimes.join(", ")}</dd></div>
            <div><dt className="text-muted">Budget for your half</dt><dd>Up to {formatMoney(p.budgetMaxCents)}</dd></div>
            <div><dt className="text-muted">Area</dt><dd>{p.neighborhood}, up to {p.travelRadiusKm} km</dd></div>
            <div><dt className="text-muted">Ages</dt><dd>{p.ageMin}–{p.ageMax}</dd></div>
          </dl>
        </div>
        <div className="card flex flex-col p-6">
          <p className="eyebrow mb-4">Account</p>
          <div className="flex flex-col gap-3 text-[14px]">
            <Link href="/settings" className="btn-quiet">Account settings</Link>
            <Link href="/notifications" className="btn-quiet">Notifications</Link>
            <Link href="/help" className="btn-quiet">Help &amp; safety</Link>
            <Link href="/policies" className="btn-quiet">Policies</Link>
          </div>
          <form action={logoutAction} className="mt-auto pt-6">
            <button className="btn-ghost w-full py-2.5 text-[14px]">Sign out</button>
          </form>
        </div>
      </div>
    </div>
  );
}
