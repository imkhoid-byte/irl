import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { registerAction } from "@/app/actions/auth";
import { currentUser } from "@/server/session";

export const metadata: Metadata = { title: "Create your account" };

export default async function Register() {
  if (await currentUser()) redirect("/onboarding");
  return (
    <div className="animate-rise">
      <h1 className="display text-[48px]">Find your date.</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">Create an account in a minute. You&apos;ll set up your profile next — it&apos;s short, we promise.</p>
      <ActionForm action={registerAction} className="mt-8 space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="field" />
          <p className="mt-1.5 text-[12px] text-muted">At least 10 characters.</p>
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Creating account…">Create account</SubmitButton>
        <p className="text-[12px] leading-relaxed text-muted">
          Sign in with Apple and Google is coming soon. By continuing you confirm you&apos;re 18+ and agree to our <Link href="/policies#guidelines" className="underline">community guidelines</Link> and <Link href="/policies" className="underline">policies</Link>.
        </p>
      </ActionForm>
      <p className="mt-6 text-[14px] text-muted">
        Already a member? <Link href="/login" className="text-ink underline underline-offset-4">Sign in</Link>
      </p>
    </div>
  );
}
