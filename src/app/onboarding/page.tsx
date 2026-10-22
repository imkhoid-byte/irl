import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { OnboardingWizard } from "@/components/profile-form";
import { onboardingAction } from "@/app/actions/profile";
import { logoutAction } from "@/app/actions/auth";
import { getDb } from "@/server/db/client";
import { listNeighborhoods, photoIdsFor } from "@/server/services/profiles";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function Onboarding() {
  const user = await requireUser();
  if (user.onboarded) redirect("/discover");
  const db = getDb();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 py-5">
        <Link href="/"><Logo /></Link>
        <form action={logoutAction}><button className="text-[13px] text-muted hover:text-ink">Sign out</button></form>
      </header>
      <main className="mx-auto max-w-xl px-5 pb-20 pt-6">
        <OnboardingWizard neighborhoods={listNeighborhoods(db)} photoIds={photoIdsFor(db, user.id)} defaults={{}} action={onboardingAction} />
      </main>
    </div>
  );
}
