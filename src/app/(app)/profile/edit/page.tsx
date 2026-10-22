import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink, PageHeader } from "@/components/ui";
import { ProfileEditor } from "@/components/profile-form";
import { PhotoManager } from "@/components/photo-manager";
import { updateProfileAction } from "@/app/actions/profile";
import { getDb } from "@/server/db/client";
import { getOwnProfile, listNeighborhoods } from "@/server/services/profiles";
import { requireMember } from "@/server/session";

export const metadata: Metadata = { title: "Edit profile" };

export default async function EditProfile() {
  const user = await requireMember();
  const db = getDb();
  const p = getOwnProfile(db, user.id);
  if (!p) redirect("/onboarding");
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/profile">Profile</BackLink>
      <PageHeader title="Edit profile" />
      <section className="mb-12">
        <h2 className="display mb-5 text-[28px]">Photos</h2>
        <PhotoManager photoIds={p.photoIds} />
      </section>
      <ProfileEditor
        neighborhoods={listNeighborhoods(db)}
        action={updateProfileAction}
        defaults={{
          firstName: p.firstName, birthDate: p.birthDate, gender: p.gender, interestedIn: p.interestedIn, ageMin: p.ageMin, ageMax: p.ageMax,
          bio: p.bio, interests: p.interests, intention: p.intention, neighborhoodId: p.neighborhoodId, travelRadiusKm: p.travelRadiusKm,
          preferredCategories: p.preferredCategories, preferredDays: p.preferredDays, preferredTimes: p.preferredTimes, budgetMaxCents: p.budgetMaxCents,
          dietaryNotes: p.dietaryNotes, accessibilityNotes: p.accessibilityNotes,
        }}
      />
    </div>
  );
}
